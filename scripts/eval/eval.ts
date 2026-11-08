#!/usr/bin/env bun
// Score regex / llm / combined against gold labels (internal/eval/gold.jsonl).
// Writes internal/eval/report.md and src/data/accuracy.json (combined system, shown on the site).
import { join } from "node:path";
import { extractRegex, type JobInput } from "../../src/lib/extract/regex";
import { combine, type Final, type LlmRow } from "../../src/lib/extract/combine";
import { evaluate, type Profile } from "../../src/lib/eligibility";
import { expandCodes } from "../../src/lib/geo";
import type { Extraction } from "../../src/lib/types";

const ROOT = join(import.meta.dir, "..", "..");
const readJsonl = async (p: string) => (await Bun.file(p).text()).split("\n").filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l));
// compact rows omit unknown fields: fill defaults
const norm = (o: Partial<LlmRow> & { id: string }): LlmRow => ({
  id: o.id,
  geo: { mode: o.geo?.mode ?? "unknown", allowed: (o.geo?.allowed ?? []).map((c) => c.toUpperCase()), excluded: (o.geo?.excluded ?? []).map((c) => c.toUpperCase()), q: Array.isArray(o.geo?.q) ? o.geo!.q : o.geo?.q ? [o.geo.q as unknown as string] : [] },
  visa: { v: o.visa?.v ?? "unknown", q: o.visa?.q ?? "" },
  reloc: { v: o.reloc?.v ?? "unknown", q: o.reloc?.q ?? "" },
  auth: { v: o.auth?.v ?? "none", country: o.auth?.country ?? null, q: o.auth?.q ?? "" },
  min_years: { v: o.min_years?.v ?? null, q: o.min_years?.q ?? "" },
  max_years: { v: o.max_years?.v ?? null, q: o.max_years?.q ?? "" },
  tz: { zones: o.tz?.zones ?? [], overlap_hours: o.tz?.overlap_hours ?? null, q: o.tz?.q ?? "" },
  onsite_days: { v: o.onsite_days?.v ?? null, q: o.onsite_days?.q ?? "" },
  pay: { min: o.pay?.min ?? null, max: o.pay?.max ?? null, currency: o.pay?.currency ?? null, period: o.pay?.period ?? null, q: o.pay?.q ?? "" },
});
const gold: LlmRow[] = (await readJsonl(join(ROOT, "internal", "eval", "gold.jsonl"))).map(norm);
const llm = new Map<string, LlmRow>((await readJsonl(join(ROOT, "internal", "cache", "llm.jsonl"))).map((o: LlmRow) => [o.id, o]));

const emptyRx = (id: string): Extraction => {
  const e = { value: null, evidence: [] };
  return { job_id: id, geo: e, visa_sponsorship: e, relocation: e, citizenship: e, min_years: e, max_years: e, timezone: e, onsite_days: e, pay: e, ambiguity: [] };
};

type Sys = "regex" | "llm" | "combined";
const FIELDS = ["geo", "visa_sponsorship", "relocation", "citizenship", "min_years", "max_years", "onsite_days", "timezone", "pay"] as const;
type F = (typeof FIELDS)[number];

/** canonical comparable value; null = abstain/unknown */
function canon(x: Final, f: F): string | null {
  const v = x[f];
  if (v.value == null || v.conflict) return null;
  switch (f) {
    case "geo": {
      const g = x.geo.value!;
      const mode = g.mode === "onsite" ? "onsite" : g.mode;
      return `${mode}:${expandCodes(g.allowed).sort().join(",")}${g.excluded.length ? "-" + expandCodes(g.excluded).sort().join(",") : ""}`;
    }
    case "citizenship": { const c = x.citizenship.value!; return `${c.kind}:${c.country}`; }
    case "timezone": return "stated";
    case "pay": { const p = x.pay.value!; return `${p.min}-${p.max}`; }
    default: return String(v.value);
  }
}

const score: Record<Sys, Record<F, { support: number; extracted: number; correct: number }>> = {} as never;
for (const s of ["regex", "llm", "combined"] as Sys[]) score[s] = Object.fromEntries(FIELDS.map((f) => [f, { support: 0, extracted: 0, correct: 0 }])) as never;
const errors: string[] = [];

const PROFILES: [string, Profile][] = [
  ["India, open to relocating with a visa, 3y", { country: "IN", open_to_relocation: true, years: 3 }],
  ["India, not relocating, 3y", { country: "IN", years: 3 }],
  ["US citizen, 5y", { country: "US", citizen_of: ["US"], years: 5 }],
  ["Germany, open to relocating with a visa, 6y", { country: "DE", open_to_relocation: true, years: 6 }],
];
const verdictConf: Record<string, Record<string, number>> = {};
let falseEligible = 0, sysEligible = 0, goldEligible = 0, caughtEligible = 0;

for (const g of gold) {
  const j = (await Bun.file(join(ROOT, "internal", "cache", "jobs", `${g.id}.json`)).json()) as JobInput;
  const gx = combine(emptyRx(g.id), g, j.location, null);
  const rx = extractRegex(j);
  const l = llm.get(g.id);
  const sys: Record<Sys, Final> = {
    regex: rx,
    llm: l ? combine(emptyRx(g.id), l, j.location, null) : emptyRx(g.id),
    combined: combine(rx, l, j.location, null),
  };
  for (const f of FIELDS) {
    const truth = canon(gx, f);
    for (const s of Object.keys(sys) as Sys[]) {
      const pred = canon(sys[s], f);
      const sc = score[s][f];
      if (truth != null) sc.support++;
      if (pred != null) sc.extracted++;
      if (pred != null && pred === truth) sc.correct++;
      if (s === "combined" && pred != null && pred !== truth) errors.push(`- ${g.id.slice(0, 8)} **${f}**: got \`${pred}\`, gold \`${truth ?? "unknown"}\``);
    }
  }
  for (const [name, p] of PROFILES) {
    const gv = evaluate(p, gx).verdict, sv = evaluate(p, sys.combined).verdict;
    verdictConf[name] ??= {};
    verdictConf[name][`${gv}→${sv}`] = (verdictConf[name][`${gv}→${sv}`] ?? 0) + 1;
    if (sv === "eligible") { sysEligible++; if (gv !== "eligible") falseEligible++; }
    if (gv === "eligible") { goldEligible++; if (sv === "eligible") caughtEligible++; }
  }
}

const pct = (a: number, b: number) => (b ? a / b : null);
const fmt = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const NAMES: Record<F, string> = { geo: "where you can work", visa_sponsorship: "visa sponsorship", relocation: "relocation help", citizenship: "citizenship / clearance / ITAR", min_years: "min years", max_years: "max years", onsite_days: "onsite days / week", timezone: "timezone requirement", pay: "pay in text" };

let md = `# Accuracy report (${gold.length} gold JDs)\n\nPrecision = correct / extracted (abstentions and conflicts don't count as extracted). Recall = correct / stated in gold.\n\n`;
md += `| field | stated | ${(["regex", "llm", "combined"] as Sys[]).map((s) => `${s} P | ${s} R`).join(" | ")} |\n|---|---|${"---|---|".repeat(3)}\n`;
for (const f of FIELDS) md += `| ${NAMES[f]} | ${score.combined[f].support} | ${(["regex", "llm", "combined"] as Sys[]).map((s) => `${fmt(pct(score[s][f].correct, score[s][f].extracted))} | ${fmt(pct(score[s][f].correct, score[s][f].support))}`).join(" | ")} |\n`;
md += `\n## Verdicts (gold→system), combined\n\n`;
for (const [name, c] of Object.entries(verdictConf)) md += `- ${name}: ${Object.entries(c).sort().map(([k, v]) => `${k} ${v}`).join(", ")}\n`;
md += `\nFalse "eligible": ${falseEligible} of ${sysEligible} eligible verdicts (${fmt(pct(sysEligible - falseEligible, sysEligible))} precision). Gold-eligible found: ${caughtEligible}/${goldEligible}.\n\n## Combined errors\n\n${errors.join("\n")}\n`;
await Bun.write(join(ROOT, "internal", "eval", "report.md"), md);

const acc = {
  n: gold.length,
  fields: FIELDS.map((f) => ({ field: NAMES[f], support: score.combined[f].support, precision: pct(score.combined[f].correct, score.combined[f].extracted), recall: pct(score.combined[f].correct, score.combined[f].support) })),
  verdict: { eligible_precision: pct(sysEligible - falseEligible, sysEligible), eligible_recall: pct(caughtEligible, goldEligible), false_eligible: falseEligible, eligible_verdicts: sysEligible, profiles: PROFILES.map(([n]) => n) },
};
await Bun.write(join(ROOT, "src", "data", "accuracy.json"), JSON.stringify(acc, null, 1));
console.log(md.split("## Combined errors")[0]);
