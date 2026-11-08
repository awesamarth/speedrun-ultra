#!/usr/bin/env bun
// Run the regex extractor over all cached jobs -> internal/cache/regex.jsonl + a coverage summary.
import { join } from "node:path";
import { extractRegex, type JobInput } from "../src/lib/extract/regex";

const CACHE = join(import.meta.dir, "..", "internal", "cache");
const glob = new Bun.Glob("*.json");
const rows: string[] = [];
const cov: Record<string, number> = {};
const amb: Record<string, number> = {};
let total = 0;

for await (const f of glob.scan(join(CACHE, "jobs"))) {
  const job = (await Bun.file(join(CACHE, "jobs", f)).json()) as JobInput & { status?: string };
  if (job.status === "closed" || !job.description_text) continue;
  const x = extractRegex(job);
  total++;
  for (const k of ["geo", "visa_sponsorship", "relocation", "citizenship", "min_years", "max_years", "timezone", "onsite_days", "pay"] as const)
    if (x[k].value != null) cov[k] = (cov[k] ?? 0) + 1;
  for (const a of x.ambiguity) { const key = a.split(":")[0] + ":" + a.split(":")[1]; amb[key] = (amb[key] ?? 0) + 1; }
  rows.push(JSON.stringify(x));
}
await Bun.write(join(CACHE, "regex.jsonl"), rows.join("\n") + "\n");
console.log(`jobs: ${total}`);
console.log("coverage:", Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, `${v} (${((100 * v) / total).toFixed(0)}%)`])));
console.log("ambiguity:", amb);
