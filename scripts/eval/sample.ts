#!/usr/bin/env bun
// Stratified, seeded sample of N jobs for ground-truth labelling -> internal/eval/sample.jsonl
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { normalize } from "../../src/lib/extract/text";

const ROOT = join(import.meta.dir, "..", "..");
const JOBS = join(ROOT, "internal", "cache", "jobs");
const OUT = join(ROOT, "internal", "eval");
await mkdir(OUT, { recursive: true });

// mulberry32
let seed = 20261104;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const listed = new Set(((await Bun.file(join(ROOT, "internal", "cache", "list.json")).json()).jobs as { id: string }[]).map((j) => j.id));
const strata: Record<string, any[]> = { remote: [], hybrid: [], onsite: [], none: [] };
for (const f of [...new Bun.Glob("*.json").scanSync(JOBS)].sort()) {
  const j = await Bun.file(join(JOBS, f)).json();
  if (!j.description_text || j.status === "closed" || !listed.has(j.id)) continue;
  const wp = (j.labels?.workplace ?? j.workplace_type ?? "").toLowerCase();
  const k = j.remote || wp === "remote" ? "remote" : wp === "hybrid" ? "hybrid" : /onsite|on-site/.test(wp) ? "onsite" : "none";
  strata[k].push(j);
}
// remote is where the product matters most -> oversampled
const quota: Record<string, number> = { remote: 25, hybrid: 9, onsite: 10, none: 6 };
const picked = Object.entries(quota).flatMap(([k, n]) => shuffle(strata[k]).slice(0, n).map((j) => ({ j, stratum: k })));
const pop = Object.fromEntries(Object.entries(strata).map(([k, v]) => [k, v.length]));

await Bun.write(join(OUT, "sample.jsonl"), picked.map(({ j }) => JSON.stringify({
  id: j.id, title: j.title, location: j.location ?? null, workplace: j.labels?.workplace ?? j.workplace_type ?? null, remote: !!j.remote,
  text: normalize(j.description_text).replace(/\n{3,}/g, "\n\n"),
})).join("\n") + "\n");
await Bun.write(join(OUT, "sample-meta.json"), JSON.stringify({ seed: 20261104, quota, population: pop, ids: picked.map(({ j, stratum }) => ({ id: j.id, stratum })) }, null, 1));
console.log({ population: pop, quota, picked: picked.length });
