// Trim the final extraction for storage/transport: cap quotes, drop empty evidence arrays.
import type { Final } from "./extract/combine";
import type { Evidence, Field } from "./types";

const MAXQ = 280;
const trimEv = (e: Evidence[]) => e.slice(0, 2).map((x) => ({ ...x, quote: x.quote.length > MAXQ ? x.quote.slice(0, MAXQ - 1) + "…" : x.quote }));

export function compactFinal(x: Final): Final {
  const f = <T>(v: Field<T>): Field<T> => {
    const o: Field<T> = { value: v.value, evidence: v.value == null && !v.conflict ? [] : trimEv(v.evidence) };
    if (v.method) o.method = v.method;
    if (v.conflict) o.conflict = true;
    return o;
  };
  return {
    job_id: x.job_id,
    geo: f(x.geo),
    visa_sponsorship: f(x.visa_sponsorship),
    relocation: f(x.relocation),
    citizenship: f(x.citizenship),
    min_years: f(x.min_years),
    max_years: f(x.max_years),
    timezone: f(x.timezone),
    onsite_days: f(x.onsite_days),
    pay: f(x.pay),
    ambiguity: [],
  };
}
