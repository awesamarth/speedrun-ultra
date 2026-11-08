#!/usr/bin/env bun
// Build compact LLM input batches: internal/llm/in/batch-NNN.jsonl
// Usage: bun scripts/llm/prepare.ts [--size 80] [--limit N] [--only-missing]
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { snippets } from "../../src/lib/extract/text";

const ROOT = join(import.meta.dir, "..", "..");
const JOBS = join(ROOT, "internal", "cache", "jobs");
const IN = join(ROOT, "internal", "llm", "in");
const OUT = join(ROOT, "internal", "llm", "out");
const args = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const SIZE = opt("size", 80);
const LIMIT = opt("limit", Infinity);
const ONLY_MISSING = args.includes("--only-missing");

// ids already answered (for incremental runs)
const done = new Set<string>();
if (ONLY_MISSING && existsSync(OUT))
  for await (const f of new Bun.Glob("*.jsonl").scan(OUT))
    for (const line of (await Bun.file(join(OUT, f)).text()).split("\n"))
      try { const o = JSON.parse(line); if (o?.id) done.add(o.id); } catch {}

// --only-missing appends: never delete inputs other runs may be reading; skip ids already batched
let nextBatch = 0;
if (ONLY_MISSING && existsSync(IN)) {
  for (const f of new Bun.Glob("batch-*.jsonl").scanSync(IN)) {
    nextBatch = Math.max(nextBatch, Number(f.match(/batch-(\d+)/)![1]) + 1);
    for (const line of (await Bun.file(join(IN, f)).text()).split("\n")) try { done.add(JSON.parse(line).id); } catch {}
  }
} else await rm(IN, { recursive: true, force: true });
await mkdir(IN, { recursive: true });

const listed = new Set(((await Bun.file(join(ROOT, "internal", "cache", "list.json")).json()).jobs as { id: string }[]).map((j) => j.id));
const recs: string[] = [];
const files = [...new Bun.Glob("*.json").scanSync(JOBS)].sort();
for (const f of files) {
  if (recs.length >= LIMIT) break;
  const j = await Bun.file(join(JOBS, f)).json();
  if (!j.description_text || j.status === "closed" || done.has(j.id) || !listed.has(j.id)) continue;
  recs.push(JSON.stringify({
    id: j.id, title: j.title, location: j.location ?? null,
    workplace: j.labels?.workplace ?? j.workplace_type ?? null, remote: !!j.remote,
    s: snippets(j.description_text).map((x) => x.text),
  }));
}

const offset = ONLY_MISSING ? Math.max(nextBatch, [...new Bun.Glob("batch-*.jsonl").scanSync(OUT)].length) : 0;
let b = 0;
for (let i = 0; i < recs.length; i += SIZE, b++)
  await Bun.write(join(IN, `batch-${String(b + offset).padStart(3, "0")}.jsonl`), recs.slice(i, i + SIZE).join("\n") + "\n");
console.log(`${recs.length} jobs -> ${b} batches of ≤${SIZE} in ${IN}`);
