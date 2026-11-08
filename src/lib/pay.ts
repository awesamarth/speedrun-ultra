// Normalise posted pay to an annual USD band for filtering. Non-USD uses rough fixed rates (marked approx).

/** Approximate USD per unit, Nov 2026. Only for filtering; display keeps the original currency. */
const USD_RATE: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.72, AUD: 0.65, SGD: 0.75, CHF: 1.13, SEK: 0.095, NOK: 0.093, DKK: 0.145,
  PLN: 0.25, INR: 0.012, BRL: 0.18, MXN: 0.055, SAR: 0.27, AED: 0.27, ILS: 0.27, JPY: 0.0066, CNY: 0.14, HKD: 0.13,
};
const PER_YEAR: Record<string, number> = { year: 1, month: 12, week: 52, day: 260, hour: 2080 };
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };

export type PayInfo = {
  label: string;            // display, original currency/period
  usd_min: number | null;   // annual USD
  usd_max: number | null;
  approx: boolean;          // currency converted
  source: "api" | "jd";
};

function inferPeriod(max: number | null, min: number | null): string | null {
  const v = max ?? min;
  if (v == null) return null;
  if (v >= 20_000) return "year";
  if (v <= 500) return "hour";
  return null; // ambiguous (monthly? thousands?) -> don't guess
}

const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

export function normalizePay(min: number | null, max: number | null, currency: string | null, period: string | null, source: "api" | "jd"): PayInfo | null {
  if (min == null && max == null) return null;
  const cur = (currency ?? "USD").toUpperCase();
  const per = period ?? inferPeriod(max, min);
  const sym = SYMBOL[cur] ?? `${cur} `;
  const range = min != null && max != null && min !== max ? `${sym}${k(min)}–${k(max)}` : `${sym}${k((max ?? min)!)}`;
  const label = per && per !== "year" ? `${range}/${per === "hour" ? "hr" : per === "month" ? "mo" : per}` : range;
  const rate = USD_RATE[cur];
  const mult = per ? PER_YEAR[per] : undefined;
  if (rate == null || mult == null) return { label, usd_min: null, usd_max: null, approx: false, source };
  const conv = (v: number | null) => (v == null ? null : Math.round(v * mult * rate));
  const usd_min = conv(min), usd_max = conv(max);
  const top = usd_max ?? usd_min!;
  if (top < 5_000 || top > 3_000_000) return { label, usd_min: null, usd_max: null, approx: false, source }; // implausible
  return { label, usd_min, usd_max, approx: cur !== "USD", source };
}

/** Does the band reach the requested annual USD floor? (same idea as the board's comp filter: max >= floor) */
export function payReaches(p: PayInfo | null, floor: number): boolean | null {
  if (!p || (p.usd_min == null && p.usd_max == null)) return null;
  return (p.usd_max ?? p.usd_min!) >= floor;
}
