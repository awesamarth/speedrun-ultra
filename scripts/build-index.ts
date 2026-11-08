#!/usr/bin/env bun
// cache + regex + llm -> final extraction + data-health flags -> SQL chunks -> D1 (local or remote).
// Usage: bun scripts/build-index.ts [--remote] [--dry]
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { extractRegex, type JobInput } from "../src/lib/extract/regex";
import { combine, type LlmRow } from "../src/lib/extract/combine";
import type { Pay } from "../src/lib/types";
import { compactFinal } from "../src/lib/compact";
import { normalizePay } from "../src/lib/pay";
import { searchTokens } from "../src/lib/search-terms";

const ROOT = join(import.meta.dir, "..");
const CACHE = join(ROOT, "internal", "cache");
const SQL_DIR = join(ROOT, "internal", "sql");
const REMOTE = process.argv.includes("--remote");
const DRY = process.argv.includes("--dry");

type Job = JobInput & {
  status?: string; url: string; company: string; company_slug: string | null; function: string | null; seniority: string | null;
  employment_type: string | null; published_at: string | null; comp_summary: string | null; comp_min: number | null; comp_max: number | null;
  comp_currency: string | null; comp_period: string | null; tier: string;
  labels?: { function?: string | null; specialty?: string | null; seniority?: string | null; min_experience?: string | null; workplace?: string | null } | null;
};

const llm = new Map<string, LlmRow>();
if (existsSync(join(CACHE, "llm.jsonl")))
  for (const l of (await Bun.file(join(CACHE, "llm.jsonl")).text()).split("\n")) if (l.trim()) { const o = JSON.parse(l); llm.set(o.id, o); }

const jobs: Job[] = [];
for await (const f of new Bun.Glob("*.json").scan(join(CACHE, "jobs"))) {
  const j = (await Bun.file(join(CACHE, "jobs", f)).json()) as Job;
  if (j.status === "closed" || !j.description_text) continue;
  jobs.push(j);
}
// only keep jobs still listed
const listed = new Set(((await Bun.file(join(CACHE, "list.json")).json()).jobs as { id: string }[]).map((j) => j.id));
const live = jobs.filter((j) => listed.has(j.id));

// duplicates: same company + normalised title + location
const dupKey = (j: Job) => `${j.company}|${j.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(j.location ?? "").toLowerCase()}`;
const dupCount = new Map<string, number>();
for (const j of live) dupCount.set(dupKey(j), (dupCount.get(dupKey(j)) ?? 0) + 1);

const q = (v: unknown) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const now = new Date().toISOString();
const stmts: string[] = [];
const snapshot: Record<string, unknown>[] = [];
let withLlm = 0;

for (const j of live) {
  const rx = extractRegex(j);
  const l = llm.get(j.id);
  if (l) withLlm++;
  const apiPay: Pay | null = j.comp_min != null || j.comp_max != null
    ? { min: j.comp_min, max: j.comp_max, currency: j.comp_currency, period: (j.comp_period as Pay["period"]) ?? "year" } : null;
  const x = combine(rx, l, j.location, apiPay);

  const wpLabel = j.labels?.workplace?.toLowerCase() ?? null;
  const wpType = j.workplace_type?.toLowerCase().replace("onsite", "onsite") ?? null;
  const workplace = wpLabel ?? (wpType === "onsite" || wpType === "on-site" ? "onsite" : wpType);
  const fn = j.labels?.function ?? j.function;

  const health: string[] = [];
  if (!j.location) health.push("missing_location");
  if (!workplace) health.push("missing_workplace");
  if ((j.remote && workplace && workplace !== "remote") || (!j.remote && workplace === "remote")) health.push("remote_conflict");
  const vagueLoc = !j.location || /^\s*(remote|remote\s*[-–—]\s*multiple locations|multiple locations|anywhere)\s*$/i.test(j.location);
  if (vagueLoc && x.geo.value?.mode === "restricted" && !x.geo.conflict) health.push("hidden_restriction");
  if (!j.labels?.min_experience && x.min_years.value != null && !x.min_years.conflict) health.push("min_exp_in_text_only");
  if (j.function && j.labels?.function && j.function !== j.labels.function) health.push("function_mismatch");
  if ((dupCount.get(dupKey(j)) ?? 0) > 1) health.push("duplicate");
  // pay: API comp fields first, else pay stated in the JD text
  const pay = normalizePay(j.comp_min, j.comp_max, j.comp_currency, j.comp_period, "api")
    ?? (x.pay.value && x.pay.method !== "api" ? normalizePay(x.pay.value.min, x.pay.value.max, x.pay.value.currency, x.pay.value.period, "jd") : null);
  if (pay?.source === "jd") health.push("pay_in_text_only");
  if ((j.remote || workplace === "remote") && x.geo.value?.mode === "onsite" && !x.geo.conflict && x.geo.evidence.some((e) => e.from === "jd"))
    health.push("remote_label_jd_office");

  snapshot.push({
    id: j.id, title: j.title, company: j.company, company_slug: j.company_slug, url: j.url, location: j.location, workplace,
    remote: !!j.remote, function: fn, specialty: j.labels?.specialty ?? null, seniority: j.labels?.seniority ?? j.seniority,
    min_exp_label: j.labels?.min_experience ?? null, employment_type: j.employment_type, published_at: j.published_at,
    comp_summary: j.comp_summary, pay, x: compactFinal(x), health,
  });
  stmts.push(
    `INSERT OR REPLACE INTO jobs (id,title,company,company_slug,url,location,workplace,remote,function,specialty,seniority,min_exp_label,employment_type,published_at,comp_summary,tier,geo_mode,geo_allowed,geo_conflict,visa,auth_kind,min_years,x,health,updated_at) VALUES (` +
      [j.id, j.title, j.company, j.company_slug, j.url, j.location, workplace, j.remote ? 1 : 0, fn, j.labels?.specialty ?? null, j.labels?.seniority ?? j.seniority,
        j.labels?.min_experience ?? null, j.employment_type, j.published_at, j.comp_summary, j.tier,
        x.geo.value?.mode ?? null, JSON.stringify(x.geo.value?.allowed ?? []), x.geo.conflict ? 1 : 0, x.visa_sponsorship.value, x.citizenship.value?.kind ?? null,
        x.min_years.value, JSON.stringify(compactFinal(x)), JSON.stringify(health), now].map(q).join(",") + ");",
  );
}

await rm(SQL_DIR, { recursive: true, force: true });
await mkdir(SQL_DIR, { recursive: true });

// statement groups, applied in order: job rows, snapshot parts, then cleanup + meta
const groups: string[][] = [];
for (let i = 0; i < stmts.length; i += 100) groups.push(stmts.slice(i, i + 100));
// gzipped snapshot, newest first, in ~90KB base64 parts (D1 caps a statement at 100KB)
snapshot.sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")));
const b64 = Buffer.from(Bun.gzipSync(new TextEncoder().encode(JSON.stringify(snapshot)))).toString("base64");
const key = `index:${now}`;
const PART = 90_000;
const blobStmts: string[] = [];
for (let i = 0, p = 0; i < b64.length; i += PART, p++) blobStmts.push(`INSERT INTO blobs (key,part,data) VALUES (${q(key)},${p},'${b64.slice(i, i + PART)}');`);
for (let i = 0; i < blobStmts.length; i += 5) groups.push(blobStmts.slice(i, i + 5));
console.log(`snapshot: ${snapshot.length} rows, ${(b64.length / 1e6).toFixed(2)}MB base64 in ${blobStmts.length} parts`);

// keyword search over JD text: inverted index word -> delta-encoded positions in the snapshot (no JD text stored).
// Loaded lazily by the app only when a search has q.
const descById = new Map(live.map((j) => [j.id, j.description_text ?? ""]));
const postings = new Map<string, number[]>();
snapshot.forEach((row, i) => {
  for (const t of new Set(searchTokens(descById.get(row.id as string) ?? ""))) {
    let l = postings.get(t);
    if (!l) postings.set(t, (l = []));
    l.push(i);
  }
});
const encoded: Record<string, string> = {};
for (const [t, l] of postings) { let prev = -1; encoded[t] = l.map((i) => { const d = i - prev; prev = i; return d.toString(36); }).join(","); }
const termsKey = `terms:${now}`;
const termsB64 = Buffer.from(Bun.gzipSync(new TextEncoder().encode(JSON.stringify({ index_key: key, postings: encoded })))).toString("base64");
const termStmts: string[] = [];
for (let i = 0, p = 0; i < termsB64.length; i += PART, p++) termStmts.push(`INSERT INTO blobs (key,part,data) VALUES (${q(termsKey)},${p},'${termsB64.slice(i, i + PART)}');`);
for (let i = 0; i < termStmts.length; i += 5) groups.push(termStmts.slice(i, i + 5));
console.log(`terms: ${postings.size} words, ${(termsB64.length / 1e6).toFixed(2)}MB base64 in ${termStmts.length} parts`);
const fetchedAt = (await Bun.file(join(CACHE, "list.json")).json()).fetched_at;
groups.push([
  `DELETE FROM jobs WHERE updated_at <> ${q(now)};`,
  `INSERT OR REPLACE INTO meta (key,value) VALUES ('built_at', ${q(now)}), ('source_fetched_at', ${q(fetchedAt)}), ('index_key', ${q(key)}), ('terms_key', ${q(termsKey)});`,
  `DELETE FROM blobs WHERE key NOT IN (${q(key)}, ${q(termsKey)});`,
]);
console.log(`jobs: ${live.length} (llm: ${withLlm}) -> ${groups.length} batches`);

const D1_ID = "87b009e1-e313-4a60-afb7-9be312f16fe7";
const LOCAL_D1_DIR = join(ROOT, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");

if (!DRY) {
  if (REMOTE) {
    // remote: Cloudflare `cf` CLI, one JSON batch file per group
    for (const [n, g] of groups.entries()) {
      const f = join(SQL_DIR, `batch-${String(n).padStart(3, "0")}.json`);
      await Bun.write(f, JSON.stringify(g.map((sql) => ({ sql }))));
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const p = Bun.spawnSync(["cf", "d1", "query", D1_ID, "--batch", `@${f}`, "--quiet"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
        ok = p.exitCode === 0;
        if (!ok) { console.error(`\nbatch ${n} attempt ${attempt + 1} failed: ${(p.stderr.toString() || p.stdout.toString()).slice(0, 500)}`); await Bun.sleep(2000 * (attempt + 1)); }
      }
      if (!ok) process.exit(1);
      process.stdout.write(".");
    }
  } else {
    // local: the miniflare SQLite file that `next dev` (getPlatformProxy) reads
    const { Database } = await import("bun:sqlite");
    const file = [...new Bun.Glob("*.sqlite").scanSync(LOCAL_D1_DIR)].find((f) => f !== "metadata.sqlite");
    if (!file) { console.error(`no local D1 file in ${LOCAL_D1_DIR}; run \`bun run dev\` once first`); process.exit(1); }
    const db = new Database(join(LOCAL_D1_DIR, file));
    db.transaction(() => { for (const g of groups) for (const sql of g) db.run(sql); })();
    db.close();
  }
  console.log(`\nloaded into ${REMOTE ? "remote" : "local"} D1`);
}
