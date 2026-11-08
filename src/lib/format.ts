// Input normalisation + compact output shared by the JSON API and the MCP server.
import { z } from "zod";
import { COUNTRIES, COUNTRY_NAME } from "./geo";
import type { Profile, Verdict } from "./eligibility";
import type { Hit, JobRow, SearchOpts, search } from "./store";
import { evaluate } from "./eligibility";
import { CHECKED, LEVELS, levelOf, NOT_CHECKED, sourceJobApi, type Level } from "./level";

export function toCountry(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.trim();
  if (/^[A-Za-z]{2}$/.test(v) && COUNTRY_NAME[v.toUpperCase()]) return v.toUpperCase();
  if (/^uk$/i.test(v)) return "GB";
  const low = v.toLowerCase();
  for (const [code, names] of Object.entries(COUNTRIES)) if (names.includes(low)) return code;
  return null;
}

const countryList = z.union([z.array(z.string()), z.string()]).optional()
  .transform((v) => (v == null ? undefined : (Array.isArray(v) ? v : v.split(",")).map(toCountry).filter((c): c is string => !!c)));
const bool = z.union([z.boolean(), z.enum(["true", "false", "on", "1", "0"]).transform((v) => v === "true" || v === "on" || v === "1")]);

export const profileShape = {
  country: z.string().describe("Country the user lives in and can legally work in, ISO2 or name (e.g. 'IN' or 'India'). Ask the user; never assume."),
  authorized_in: countryList.describe("Other countries the user can already work in without a visa (e.g. 'US,CA'). Optional."),
  open_to_relocation: bool.optional().describe("True if the user would move to another country if the employer sponsors a visa. Default false: office jobs abroad are ruled out."),
  years: z.coerce.number().min(0).max(50).optional().describe("Years of professional experience."),
  citizen_of: countryList.describe("Citizenships held (only matters for US-citizen/clearance roles). Optional."),
};

export const searchShape = {
  ...profileShape,
  show: z.enum(["remote", "office", "both"]).optional().describe("remote = remote-open roles only; office = onsite/hybrid only; both (default)."),
  min_salary: z.coerce.number().int().min(0).max(2_000_000).optional().describe("Annual pay floor in USD: keep roles whose posted band reaches it. Non-USD bands are converted approximately."),
  include_no_salary: bool.optional().describe("With min_salary, also keep roles that don't post pay. Default false."),
  level: z.union([z.array(z.string()), z.string()]).optional()
    .transform((v) => (v == null ? undefined : (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim().toLowerCase().replace(/[\s-]+/g, "_")).filter((x): x is Level => (LEVELS as readonly string[]).includes(x))))
    .describe(`Keep only these board levels, comma-separated: ${LEVELS.join(", ")}. Roles with no level label are always kept. Use it to drop internships or senior roles that don't fit the user.`),
  function: z.enum(["engineering", "product"]).optional().describe("Role function."),
  q: z.string().max(120).optional().describe("Free-text match on title/company/location/specialty, e.g. 'backend', 'ml infra', 'Stripe'."),
  include_unclear: bool.optional().describe("Also return roles whose eligibility is unclear (missing/conflicting evidence). Default false."),
  page: z.coerce.number().int().min(0).max(500).optional().describe("Page number, starting at 0 (the first page is 0). Use next_page from the previous response."),
  limit: z.coerce.number().int().min(1).max(50).optional().describe("Page size, default 10 (max 50)."),
};
export const searchSchema = z.object(searchShape);
export type SearchInput = z.infer<typeof searchSchema>;

export function toProfile(i: { country: string; years?: number; open_to_relocation?: boolean; authorized_in?: string[]; citizen_of?: string[] }): Profile | { error: string } {
  const c = toCountry(i.country);
  if (!c) return { error: `Unknown country '${i.country}'. Use an ISO 3166-1 alpha-2 code like IN, US, GB, DE, BR.` };
  return { country: c, years: i.years, open_to_relocation: i.open_to_relocation ?? false, authorized_in: i.authorized_in?.filter((x) => x !== c), citizen_of: i.citizen_of };
}

export function toSearchOpts(i: SearchInput, defaultLimit = 10): SearchOpts {
  const verdicts: Verdict[] = i.include_unclear ? ["eligible", "unclear"] : ["eligible"];
  return {
    function: i.function ?? null, q: i.q ?? null, verdicts, show: i.show ?? "both",
    min_salary: i.min_salary || null, include_no_salary: i.include_no_salary ?? false, level: i.level?.length ? i.level : null,
    page: i.page ?? 0, limit: i.limit ?? defaultLimit,
  };
}

/** Compact, quote-carrying representation of one job verdict. */
export function hitOut(h: Hit) {
  const { job: j, result } = h;
  return {
    id: j.id.slice(0, 8),
    title: j.title,
    company: j.company,
    url: j.url,
    location: j.location,
    workplace: j.workplace,
    posted: j.published_at?.slice(0, 10) ?? null,
    pay: j.pay ? { text: j.pay.label, annual_usd: j.pay.usd_min != null || j.pay.usd_max != null ? [j.pay.usd_min, j.pay.usd_max] : null, approx: j.pay.approx, from: j.pay.source === "api" ? "board" : "job description" } : null,
    level: levelOf(j.seniority),
    board_labels: { seniority: j.seniority, employment_type: j.employment_type, min_experience: j.min_exp_label },
    data_health: j.health,
    verdict: result.verdict,
    reasons: result.checks.map((c) => ({ check: c.check, status: c.status, reason: c.reason, quotes: c.evidence.map((e) => e.quote) })),
    facts: facts(j),
    full_description: sourceJobApi(j.id),
  };
}

/** Search response shared by the JSON API and the MCP tool. */
export function searchOut(profile: Profile, r: Awaited<ReturnType<typeof search>>, opts: SearchOpts) {
  const warnings: string[] = [];
  if (r.hits.length === 0 && r.total > 0 && r.page > 0) {
    warnings.push(`Page ${r.page} is past the end: ${r.total} roles match and pages start at 0. Last page is ${Math.max(0, Math.ceil(r.total / r.limit) - 1)}.`);
  }
  return {
    profile_used: profile,
    filters_used: { show: opts.show, level: opts.level ?? "all", min_salary: opts.min_salary, function: opts.function, q: opts.q, verdicts: opts.verdicts },
    eligible_means: `Passes these checks with evidence from the posting: ${CHECKED.join(", ")}. Not checked: ${NOT_CHECKED}. Missing years is not a blocker.`,
    counts_all_verdicts: r.counts,
    total_matching: r.total,
    page: r.page,
    page_size: r.limit,
    has_more: r.has_more,
    next_page: r.has_more ? r.page + 1 : null,
    ...(warnings.length ? { warnings } : {}),
    results: r.hits.map(hitOut),
    index_built_at: r.builtAt,
  };
}

/** Non-gating facts worth showing (all with evidence in check_job). */
export function facts(j: JobRow) {
  const x = j.x;
  const o: Record<string, unknown> = {};
  if (x.visa_sponsorship.value && !x.visa_sponsorship.conflict) o.visa_sponsorship = x.visa_sponsorship.value;
  if (x.relocation.value) o.relocation_help = x.relocation.value;
  if (x.min_years.value != null) o.min_years = x.min_years.value;
  if (x.timezone.value) o.timezone = [...x.timezone.value.zones, x.timezone.value.overlap_hours != null ? `${x.timezone.value.overlap_hours}h overlap` : null].filter(Boolean).join(", ");
  if (x.onsite_days.value != null) o.onsite_days_per_week = x.onsite_days.value;
  return o;
}

/** Full detail for one job: every extracted field with evidence + optional verdict. */
export function jobOut(j: JobRow, profile?: Profile) {
  const x = j.x;
  const field = <T>(f: { value: T | null; evidence: { quote: string }[]; method?: string; conflict?: boolean }) =>
    ({ value: f.value ?? "unknown", ...(f.conflict ? { conflict: true } : {}), quotes: f.evidence.map((e) => e.quote), ...(f.method ? { source: f.method } : {}) });
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    url: j.url,
    location: j.location,
    workplace: j.workplace,
    remote_flag: j.remote,
    function: j.function,
    seniority: j.seniority,
    level: levelOf(j.seniority),
    employment_type: j.employment_type,
    posted: j.published_at,
    full_description: sourceJobApi(j.id),
    extracted: {
      where_you_can_work: field(x.geo),
      visa_sponsorship: field(x.visa_sponsorship),
      relocation_help: field(x.relocation),
      legal_requirement: field(x.citizenship),
      min_years: field(x.min_years),
      max_years: field(x.max_years),
      timezone: field(x.timezone),
      onsite_days_per_week: field(x.onsite_days),
      pay: field(x.pay),
    },
    board_labels: { min_experience: j.min_exp_label, workplace: j.workplace },
    data_health: j.health,
    ...(profile ? { eligibility: (() => { const r = evaluate(profile, x); return { verdict: r.verdict, checked: CHECKED, not_checked: NOT_CHECKED, reasons: r.checks.map((c) => ({ check: c.check, status: c.status, reason: c.reason, quotes: c.evidence.map((e) => e.quote) })) }; })() } : {}),
  };
}
