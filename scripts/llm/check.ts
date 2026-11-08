#!/usr/bin/env bun
// Gate for one LLM batch: output must have a parseable line (with matching id) for >= 95% of inputs.
// Usage: bun scripts/llm/check.ts 007
import { join } from "node:path";
const n = process.argv[2];
const root = join(import.meta.dir, "..", "..", "internal", "llm");
const ids = (await Bun.file(join(root, "in", `batch-${n}.jsonl`)).text()).split("\n").filter(Boolean).map((l) => JSON.parse(l).id as string);
const out = Bun.file(join(root, "out", `batch-${n}.jsonl`));
if (!(await out.exists())) { console.error("no output file"); process.exit(1); }
const got = new Set<string>();
for (const l of (await out.text()).split("\n")) { try { const o = JSON.parse(l.trim()); if (o?.id) got.add(o.id); } catch {} }
const hit = ids.filter((i) => got.has(i)).length;
console.log(`batch ${n}: ${hit}/${ids.length}`);
process.exit(hit >= Math.ceil(ids.length * 0.95) ? 0 : 1);
