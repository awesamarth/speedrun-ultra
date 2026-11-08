// Merge regex + LLM extractions into the final per-job record.
// Rules: agree => method "both"; one side only => that side; disagree => conflict (verdict can't be "eligible" on it).
import type { Evidence, Extraction, Field, Geo, Pay, Timezone } from "../types";
import { expandCodes } from "../geo";

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

const ev = (q: string | undefined | null, location?: string | null): Evidence[] =>
  q ? [{ quote: q, from: location && q.trim() === location.trim() ? "location" : "jd" }] : [];

function pick<T>(r: Field<T>, l: Field<T>, same: (a: T, b: T) => boolean): Field<T> {
  if (r.value == null && l.value == null) return { value: null, evidence: [] };
  if (r.value == null) return { ...l, method: "llm" };
  if (l.value == null) return { ...r, method: r.method ?? "regex" };
  if (same(r.value, l.value)) return { value: l.value, evidence: dedupe([...l.evidence, ...r.evidence]), method: "both" };
  return { value: l.value, evidence: dedupe([...l.evidence, ...r.evidence]).slice(0, 3), method: "llm", conflict: true };
}

function dedupe(e: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return e.filter((x) => { const k = x.quote.toLowerCase().slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
}

const setEq = (a: string[], b: string[]) => { const A = new Set(expandCodes(a)), B = new Set(expandCodes(b)); return A.size === B.size && [...A].every((x) => B.has(x)); };

export type Final = Omit<Extraction, "ambiguity"> & { ambiguity: string[] };

export function combine(rx: Extraction, llm: LlmRow | undefined, location: string | null, apiPay: Pay | null): Final {
  if (!llm) {
    // regex alone never establishes "open worldwide": that needs LLM agreement
    const geo = rx.geo.value?.mode === "anywhere" ? { ...rx.geo, conflict: true } : rx.geo;
    return { ...rx, geo, pay: apiPay ? { value: apiPay, evidence: [], method: "api" } : rx.pay };
  }

  // geo
  const lg = llm.geo;
  const llmGeo: Field<Geo> = lg.mode === "unknown" ? { value: null, evidence: [] } : {
    value: { mode: lg.mode as Geo["mode"], allowed: lg.allowed, excluded: lg.excluded },
    evidence: lg.q.flatMap((q) => ev(q, location)),
  };
  let geo: Field<Geo>;
  if (rx.geo.value && llmGeo.value) {
    const a = rx.geo.value, b = llmGeo.value;
    const sameMode = a.mode === b.mode || (a.mode === "onsite" && b.mode === "restricted") || (a.mode === "restricted" && b.mode === "onsite");
    const agree = sameMode && setEq(a.allowed, b.allowed);
    geo = { value: b, evidence: dedupe([...llmGeo.evidence, ...rx.geo.evidence]).slice(0, 3), method: agree ? "both" : "llm", conflict: !agree || rx.geo.conflict };
  } else if (llmGeo.value) {
    geo = { ...llmGeo, method: "llm" };
  } else if (rx.geo.value) {
    // LLM read the same text and found nothing: only trust regex if it came from the structured location field
    geo = rx.geo.method === "api" ? rx.geo : { ...rx.geo, conflict: true };
  } else geo = { value: null, evidence: [] };

  const yn = (v: string) => (v === "yes" || v === "no" ? (v as "yes" | "no") : null);
  const visa = pick(rx.visa_sponsorship, { value: yn(llm.visa.v), evidence: ev(llm.visa.q) }, (a, b) => a === b);
  const relocation = pick(rx.relocation, { value: yn(llm.reloc.v), evidence: ev(llm.reloc.q) }, (a, b) => a === b);

  const authKinds = ["citizen", "us_person", "clearance", "work_authorization"] as const;
  type Auth = { country: string; kind: (typeof authKinds)[number] };
  const la: Field<Auth> = authKinds.includes(llm.auth.v as Auth["kind"]) && llm.auth.country
    ? { value: { country: llm.auth.country.toUpperCase(), kind: llm.auth.v as Auth["kind"] }, evidence: ev(llm.auth.q) }
    : { value: null, evidence: [] };
  const citizenship = pick(rx.citizenship, la, (a, b) => a.kind === b.kind && a.country === b.country);
  // a work_authorization-vs-stronger disagreement is not a real conflict: keep the stronger requirement
  if (citizenship.conflict && rx.citizenship.value && la.value) {
    const rank = { work_authorization: 0, us_person: 1, clearance: 2, citizen: 3 };
    const strong = rank[rx.citizenship.value.kind] >= rank[la.value.kind] ? rx.citizenship : la;
    if (rx.citizenship.value.country === la.value.country) Object.assign(citizenship, { value: strong.value, conflict: false, method: "both" });
  }

  const num = (v: number | null) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const min_years = pick(rx.min_years, { value: num(llm.min_years.v), evidence: ev(llm.min_years.q) }, (a, b) => a === b);
  const max_years = pick(rx.max_years, { value: num(llm.max_years.v), evidence: ev(llm.max_years.q) }, (a, b) => a === b);
  const onsite_days = pick(rx.onsite_days, { value: num(llm.onsite_days.v), evidence: ev(llm.onsite_days.q) }, (a, b) => a === b);

  const ltz: Field<Timezone> = llm.tz.q && (llm.tz.zones.length || llm.tz.overlap_hours != null)
    ? { value: { zones: llm.tz.zones, overlap_hours: llm.tz.overlap_hours }, evidence: ev(llm.tz.q) } : { value: null, evidence: [] };
  const timezone = pick(rx.timezone, ltz, () => true);

  const lp: Field<Pay> = llm.pay.q && (llm.pay.min != null || llm.pay.max != null)
    ? { value: { min: llm.pay.min, max: llm.pay.max, currency: llm.pay.currency, period: (llm.pay.period as Pay["period"]) ?? null }, evidence: ev(llm.pay.q) }
    : { value: null, evidence: [] };
  let pay = pick(rx.pay, lp, (a, b) => a.min === b.min && a.max === b.max);
  if (pay.value == null && apiPay) pay = { value: apiPay, evidence: [], method: "api" };

  return { job_id: rx.job_id, geo, visa_sponsorship: visa, relocation, citizenship, min_years, max_years, timezone, onsite_days, pay, ambiguity: rx.ambiguity };
}
