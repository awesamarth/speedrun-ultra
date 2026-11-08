// Read side: load the compact index from D1 once per isolate (short TTL), then filter in memory.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Final } from "./extract/combine";
import { evaluate, type Profile, type Result, type Verdict } from "./eligibility";
import { payReaches, type PayInfo } from "./pay";
import { levelOf, type Level } from "./level";

export type JobRow = {
  id: string; title: string; company: string; company_slug: string | null; url: string; location: string | null;
  workplace: string | null; remote: boolean; function: string | null; specialty: string | null; seniority: string | null;
  min_exp_label: string | null; employment_type: string | null; published_at: string | null; comp_summary: string | null;
  pay?: PayInfo | null; x: Final; health: string[];
};
type Index = { rows: JobRow[]; byId: Map<string, JobRow>; builtAt: string | null; fetchedAt: string | null; loadedAt: number };

const TTL_MS = 5 * 60_000;
// globalThis, not module scope: bundled route modules may each get their own module instance.
const G = globalThis as unknown as { __su_index?: Index | null; __su_inflight?: Promise<Index> | null; __su_last?: { hit: boolean; ms: number } };

async function gunzipB64(b64: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

async function load(): Promise<Index> {
  const { env } = await getCloudflareContext({ async: true });
  const db = env.DB;
  const meta = await db.prepare("SELECT key,value FROM meta").all<{ key: string; value: string }>();
  const m = Object.fromEntries(meta.results.map((x) => [x.key, x.value]));
  if (m.index_key) {
    // fast path: one query for the gzipped snapshot
    const parts = await db.prepare("SELECT data FROM blobs WHERE key = ? ORDER BY part").bind(m.index_key).all<{ data: string }>();
    if (parts.results.length) {
      const rows = JSON.parse(await gunzipB64(parts.results.map((p) => p.data).join(""))) as JobRow[];
      return { rows, byId: new Map(rows.map((r) => [r.id, r])), builtAt: m.built_at ?? null, fetchedAt: m.source_fetched_at ?? null, loadedAt: Date.now() };
    }
  }
  return loadRows(db, m);
}

async function loadRows(db: D1Database, m: Record<string, string>): Promise<Index> {
  const rows: JobRow[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const r = await db.prepare(
      "SELECT id,title,company,company_slug,url,location,workplace,remote,function,specialty,seniority,min_exp_label,employment_type,published_at,comp_summary,x,health FROM jobs ORDER BY published_at DESC, id LIMIT ? OFFSET ?",
    ).bind(PAGE, off).all<Record<string, unknown>>();
    for (const o of r.results) rows.push({ ...(o as unknown as JobRow), remote: !!o.remote, x: JSON.parse(o.x as string), health: JSON.parse(o.health as string) });
    if (r.results.length < PAGE) break;
  }
  return { rows, byId: new Map(rows.map((r) => [r.id, r])), builtAt: m.built_at ?? null, fetchedAt: m.source_fetched_at ?? null, loadedAt: Date.now() };
}

export async function getIndex(): Promise<Index> {
  const c = G.__su_index;
  if (c && Date.now() - c.loadedAt < TTL_MS) { G.__su_last = { hit: true, ms: 0 }; return c; }
  if (!G.__su_inflight) {
    const t0 = Date.now();
    G.__su_inflight = load().then((i) => { G.__su_index = i; G.__su_last = { hit: false, ms: Date.now() - t0 }; return i; }).finally(() => { G.__su_inflight = null; });
  }
  // serve stale while refreshing
  return c ?? G.__su_inflight!;
}

export const lastIndexLoad = () => G.__su_last;

// ------------------------------------------------------------------ queries
export type SearchOpts = {
  function?: "engineering" | "product" | null;
  q?: string | null;
  verdicts?: Verdict[];      // default ["eligible"]
  /** remote = remote-open roles; office = onsite/hybrid roles; both (default) */
  show?: "remote" | "office" | "both";
  /** annual USD floor: keep roles whose posted band reaches it */
  min_salary?: number | null;
  /** with min_salary, also keep roles that don't post pay */
  include_no_salary?: boolean;
  /** keep only these board levels; roles with no level label are always kept */
  level?: Level[] | null;
  page?: number;             // 0-based
  limit?: number;            // default 20, max 50
};

export type Hit = { job: JobRow; result: Result };

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 1);

function matchesQ(j: JobRow, q: string): boolean {
  const hay = `${j.title} ${j.company} ${j.location ?? ""} ${j.specialty ?? ""} ${j.seniority ?? ""}`.toLowerCase();
  return tokens(q).every((t) => hay.includes(t));
}

export function isRemoteish(j: JobRow): boolean {
  return j.remote || j.workplace === "remote" || j.x.geo.value?.mode === "restricted" || j.x.geo.value?.mode === "anywhere";
}

export async function search(profile: Profile, o: SearchOpts) {
  const idx = await getIndex();
  const verdicts = new Set(o.verdicts?.length ? o.verdicts : (["eligible"] as Verdict[]));
  const limit = Math.min(Math.max(o.limit ?? 20, 1), 50);
  const page = Math.max(o.page ?? 0, 0);
  const counts: Record<Verdict, number> = { eligible: 0, not_eligible: 0, unclear: 0 };
  const hits: Hit[] = [];
  for (const j of idx.rows) {
    if (o.function && j.function !== o.function) continue;
    if (o.q && !matchesQ(j, o.q)) continue;
    if (o.show === "remote" && !isRemoteish(j)) continue;
    if (o.show === "office" && isRemoteish(j)) continue;
    if (o.level?.length) {
      const lv = levelOf(j.seniority);
      if (lv && !o.level.includes(lv)) continue;
    }
    if (o.min_salary) {
      const ok = payReaches(j.pay ?? null, o.min_salary);
      if (ok === false || (ok === null && !o.include_no_salary)) continue;
    }
    const result = evaluate(profile, j.x);
    counts[result.verdict]++;
    if (verdicts.has(result.verdict)) hits.push({ job: j, result });
  }
  // eligible first, then unclear, then not_eligible; newest first within
  const rank: Record<Verdict, number> = { eligible: 0, unclear: 1, not_eligible: 2 };
  hits.sort((a, b) => rank[a.result.verdict] - rank[b.result.verdict] || (b.job.published_at ?? "").localeCompare(a.job.published_at ?? ""));
  return { total: hits.length, counts, page, limit, has_more: (page + 1) * limit < hits.length, hits: hits.slice(page * limit, (page + 1) * limit), builtAt: idx.builtAt, fetchedAt: idx.fetchedAt };
}

export async function getJob(idOrUrl: string): Promise<JobRow | null> {
  const idx = await getIndex();
  const s = idOrUrl.trim();
  if (idx.byId.has(s)) return idx.byId.get(s)!;
  // url (…-7a783045) or 8-hex prefix
  const m = s.match(/([0-9a-f]{8})(?:[0-9a-f-]*)?\/?(?:[?#].*)?$/i);
  const key = (m?.[1] ?? s).toLowerCase();
  for (const j of idx.rows) if (j.id.startsWith(key) || j.url === s) return j;
  return null;
}

/** Headline numbers + data health, computed in memory. */
export async function stats(country = "IN") {
  const idx = await getIndex();
  const remote = idx.rows.filter(isRemoteish);
  // remote roles a resident of `c` (no other work rights, needs sponsorship) can apply to
  const per = (rows: JobRow[], c: string) => {
    const out = { eligible: 0, not_eligible: 0, unclear: 0 };
    for (const j of rows) out[evaluate({ country: c }, j.x).verdict]++;
    return out;
  };
  const health: Record<string, number> = {};
  const examples: Record<string, { title: string; company: string; url: string; location: string | null }[]> = {};
  for (const j of idx.rows) for (const h of j.health) {
    health[h] = (health[h] ?? 0) + 1;
    const ex = (examples[h] ??= []);
    // one example per company, newest first (rows are sorted by published_at desc)
    if (ex.length < 3 && !ex.some((e) => e.company === j.company)) ex.push({ title: j.title, company: j.company, url: j.url, location: j.location });
  }
  const visa = { yes: 0, no: 0, unknown: 0 };
  for (const j of idx.rows) { const v = j.x.visa_sponsorship; if (v.conflict || v.value == null) visa.unknown++; else visa[v.value]++; }
  const payStated = idx.rows.filter((j) => j.pay).length;
  return {
    total: idx.rows.length,
    pay_stated: payStated,
    remote: remote.length,
    remote_for: { country, ...per(remote, country) },
    remote_us: per(remote, "US"),
    visa,
    health,
    examples,
    builtAt: idx.builtAt,
    fetchedAt: idx.fetchedAt,
  };
}
