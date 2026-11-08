#!/usr/bin/env bun
// Validate LLM outputs (schema + verbatim quotes) -> internal/cache/llm.jsonl, report rejects.
import { join } from "node:path";
import { quoteInText } from "../../src/lib/extract/text";
import { REGIONS } from "../../src/lib/geo";

const ROOT = join(import.meta.dir, "..", "..");
const OUT = join(ROOT, "internal", "llm", "out");
const JOBS = join(ROOT, "internal", "cache", "jobs");

export type LlmRow = {
  id: string;
  geo: { mode: string; allowed: string[]; excluded: string[]; q: string[] };
  visa: { v: string; q: string };
  reloc: { v: string; q: string };
  auth: { v: string; country: string | null; q: string };
  min_years: { v: number | null; q: string };
  max_years: { v: number | null; q: string };
  tz: { zones: string[]; overlap_hours: number | null; q: string };
  onsite_days: { v: number | null; q: string };
  pay: { min: number | null; max: number | null; currency: string | null; period: string | null; q: string };
};

const CODE = (c: string) => /^[A-Z]{2}$/.test(c) || c in REGIONS;
const stats = { lines: 0, parsed: 0, dupes: 0, unknownId: 0, quoteRejects: 0, badCodes: 0 };
const rejects: Record<string, number> = {};
const reject = (field: string) => { rejects[field] = (rejects[field] ?? 0) + 1; stats.quoteRejects++; };

const byId = new Map<string, LlmRow>();
for (const f of [...new Bun.Glob("batch-*.jsonl").scanSync(OUT)].sort()) {
  for (const raw of (await Bun.file(join(OUT, f)).text()).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("{")) continue;
    stats.lines++;
    let o: LlmRow;
    try { o = JSON.parse(line); } catch { continue; }
    stats.parsed++;
    if (byId.has(o.id)) stats.dupes++;
    byId.set(o.id, o);
  }
}

const rows: string[] = [];
for (const [id, o] of byId) {
  const p = join(JOBS, `${id}.json`);
  const file = Bun.file(p);
  if (!(await file.exists())) { stats.unknownId++; continue; }
  const j = await file.json();
  const hay = `${j.description_text ?? ""}\n${j.location ?? ""}`;
  const ok = (q: string | undefined) => !q || quoteInText(q, hay);

  // geo
  const g = o.geo ?? { mode: "unknown", allowed: [], excluded: [], q: [] };
  g.allowed = (g.allowed ?? []).map((c) => c.toUpperCase()).filter((c) => (CODE(c) ? true : (stats.badCodes++, false)));
  g.excluded = (g.excluded ?? []).map((c) => c.toUpperCase()).filter(CODE);
  g.q = (Array.isArray(g.q) ? g.q : g.q ? [g.q as unknown as string] : []).filter((q) => { const v = ok(q); if (!v) reject("geo"); return v; });
  if (g.mode !== "unknown" && g.mode !== "onsite" && g.q.length === 0) g.mode = "unknown"; // claim without surviving evidence
  if (g.mode === "onsite" && g.q.length === 0 && !j.location) g.mode = "unknown";
  o.geo = g;

  // scalar fields: drop value if quote fails
  const scalar = <K extends "visa" | "reloc" | "auth" | "min_years" | "max_years" | "onsite_days">(k: K, unknownVal: unknown) => {
    const f = o[k] as { v: unknown; q: string } | undefined;
    if (!f) { (o as Record<string, unknown>)[k] = { v: unknownVal, q: "" }; return; }
    if (f.v !== unknownVal && f.v != null && !f.q) { reject(k + "(no quote)"); f.v = unknownVal; }
    else if (f.q && !ok(f.q)) { reject(k); f.v = unknownVal; f.q = ""; }
  };
  scalar("visa", "unknown"); scalar("reloc", "unknown"); scalar("auth", "none");
  scalar("min_years", null); scalar("max_years", null); scalar("onsite_days", null);
  o.tz = { zones: o.tz?.zones ?? [], overlap_hours: o.tz?.overlap_hours ?? null, q: o.tz?.q ?? "" };
  o.pay = { min: o.pay?.min ?? null, max: o.pay?.max ?? null, currency: o.pay?.currency ?? null, period: o.pay?.period ?? null, q: o.pay?.q ?? "" };
  if (o.tz?.q && !ok(o.tz.q)) { reject("tz"); o.tz = { zones: [], overlap_hours: null, q: "" }; }
  if (o.pay?.q && !ok(o.pay.q)) { reject("pay"); o.pay = { min: null, max: null, currency: null, period: null, q: "" }; }
  rows.push(JSON.stringify(o));
}

await Bun.write(join(ROOT, "internal", "cache", "llm.jsonl"), rows.join("\n") + "\n");
console.log({ ...stats, kept: rows.length, rejects });
