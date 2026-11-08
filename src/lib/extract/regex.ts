// Deterministic first-pass extractor. Every value carries a verbatim quote; no evidence => null.
import type { Evidence, Extraction, Field, Geo, Pay, Timezone } from "../types";
import { CITIES, COUNTRIES, REGION_ALIASES, US_STATES } from "../geo";
import { sentences } from "./text";

export type JobInput = {
  id: string;
  title: string;
  location: string | null;
  workplace_type: string | null;
  remote: boolean;
  description_text: string | null;
  labels?: { workplace?: string | null; min_experience?: string | null } | null;
};

const empty = <T>(): Field<T> => ({ value: null, evidence: [] });
const jd = (quote: string): Evidence => ({ quote, from: "jd" });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------- places
type PlaceHit = { code: string; at: number; len: number };

const PLACE_PATTERNS: { code: string; re: RegExp }[] = (() => {
  const pats: { code: string; re: RegExp }[] = [];
  for (const [code, names] of Object.entries(REGION_ALIASES))
    for (const n of names) pats.push({ code, re: new RegExp(`(?<![\\w.])${esc(n)}(?![\\w])`, "gi") });
  for (const [code, names] of Object.entries(COUNTRIES))
    for (const n of names) {
      if (n === "us") pats.push({ code, re: /(?<![\w.])US(?![\w])/g }); // case-sensitive "US"
      else if (n === "america") continue; // too ambiguous ("Latin America", "Bank of America")
      else pats.push({ code, re: new RegExp(`(?<![\\w.])${esc(n)}(?![\\w])`, n.length <= 3 ? "g" : "gi") });
    }
  for (const name of Object.values(US_STATES)) {
    if (name === "washington" || name === "georgia") continue; // ambiguous
    pats.push({ code: "US", re: new RegExp(`(?<![\\w])${esc(name)}(?![\\w])`, "gi") });
  }
  for (const [city, code] of Object.entries(CITIES)) {
    if (city.length <= 3) continue;
    pats.push({ code, re: new RegExp(`(?<![\\w])${esc(city)}(?![\\w])`, "gi") });
  }
  return pats;
})();

/** Find places in a string; longer matches win over overlapping shorter ones. */
export function findPlaces(s: string): PlaceHit[] {
  const hits: PlaceHit[] = [];
  for (const { code, re } of PLACE_PATTERNS) for (const m of s.matchAll(re)) hits.push({ code, at: m.index!, len: m[0].length });
  hits.sort((a, b) => b.len - a.len);
  const taken: PlaceHit[] = [];
  for (const h of hits) if (!taken.some((t) => h.at < t.at + t.len && t.at < h.at + h.len)) taken.push(h);
  return taken.sort((a, b) => a.at - b.at);
}

const uniq = <T>(a: T[]) => [...new Set(a)];

/** Parse the API location field, e.g. "San Francisco, CA", "Remote - US", "Remote (Canada); London". */
export function parseLocationField(loc: string | null): string[] {
  if (!loc) return [];
  const codes = findPlaces(loc).map((h) => h.code);
  // "City, ST" US state abbreviations
  for (const m of loc.matchAll(/,\s*([A-Z]{2})\b/g)) if (US_STATES[m[1]] && !COUNTRIES[m[1]]) codes.push("US");
  return uniq(codes);
}

// ---------------------------------------------------------------- geo from JD
const RESTRICT_CUE =
  /\b(must|need to|needs to|required to|requires?|should|have to|only|exclusively|currently|open to|hiring|accepting|eligible|available to|considering)\b[^.]{0,60}\b(based|located|reside|residing|live|living|resident|residents|candidates|applicants|people|talent|hire)\b|\b(remote|work|working|based|located)\b[^.]{0,25}\b(within|in|from|across)\b|-based\b|\bonly\b/i;
const WORLDWIDE =
  /\b(work from anywhere|anywhere in the world|from anywhere|any country|any location|worldwide|work from any country|hire (globally|anywhere|internationally)|location[- ]agnostic|location[- ]independent)\b/i;
const NOT_WORLDWIDE = /\b(not borderless|within your country|not (a )?work[- ]from[- ]anywhere|anywhere in the (us|u\.s\.|united states|uk|eu|europe|country))\b/i;
const EXCLUDE_CUE = /\b(except|excluding|excludes|exclusion|not (able|eligible) to (hire|employ)|cannot (hire|employ)|unable to (hire|employ)|not (hiring|accepting))\b/i;
const MARKETING = /\b(customers?|users?|clients?|teams? (around|across)|our (product|platform|app)|empower\w*|millions|businesses|work together|collaborat\w*)\b/i;
const PAY_TALK = /\b(salary|compensation|pay range|base pay|ote|equity|\$\s?\d)/i;

function geoFromJd(ss: string[]) {
  const allowed: { code: string; quote: string }[] = [];
  const excluded: { code: string; quote: string }[] = [];
  const world: string[] = [];
  const notWorld: string[] = [];
  for (const s of ss) {
    if (s.length > 600) continue;
    if (NOT_WORLDWIDE.test(s)) notWorld.push(s);
    const places = findPlaces(s);
    const anywhereIn = /\banywhere\s+(in|within|across|between|from)\b/i.exec(s);
    const scoped = anywhereIn && places.some((p) => p.at > anywhereIn.index);
    if (scoped) { for (const p of places) if (p.at > anywhereIn!.index) allowed.push({ code: p.code, quote: s }); continue; }
    const PERK = /\b(benefits?|stipend|perks?|allowance|up to (a|one|two|\d+) (weeks?|months?)|weeks? (a|per) year|days? (a|per) year|for a month|vacation|pto)\b/i;
    if (WORLDWIDE.test(s) && !MARKETING.test(s) && !PERK.test(s) && /\b(remote|work|hire|hiring|based|team|candidates|role|position)\b/i.test(s)) world.push(s);
    if (!places.length) continue;
    if (EXCLUDE_CUE.test(s)) {
      const cut = s.search(EXCLUDE_CUE);
      for (const p of places) if (p.at > cut) excluded.push({ code: p.code, quote: s });
      continue;
    }
    if (PAY_TALK.test(s)) continue; // "US candidates only: the salary range is..."
    if (/\b(our )?offices? in\b/i.test(s) && /\b(if you prefer|option|optional|welcome to|can work from)\b/i.test(s)) continue;
    if (RESTRICT_CUE.test(s) && /\b(remote|based|located|reside|residing|live|living|resident|candidates|applicants|hire|hiring|work from|work in|time ?zone|-based|only)\b/i.test(s)) {
      // skip company-HQ descriptions ("Founded in 2022 and based in NYC")
      if (/\b(founded|headquartered|hq\b|offices? in|we('re| are) based|company is based|backed by)\b/i.test(s) && !/\b(you|candidates|applicants|must|role|position)\b/i.test(s)) continue;
      for (const p of places) allowed.push({ code: p.code, quote: s });
    }
  }
  return { allowed, excluded, world, notWorld };
}

// ---------------------------------------------------------------- visa / auth
const VISA_TOPIC = /\b(visas?|h-?1b|o-?1|tn visa|immigration|(visa |employment |work |immigration )?sponsorship|sponsor (visas?|candidates|international|work))\b/i;
const NEG = /\b(not|unable|cannot|can't|cant|won't|will not|no|without|never|isn't|aren't|don't|doesn't|do not|does not|n't)\b/i;
const POS = /\b(sponsor|sponsors|sponsorship|support|supports|provide|provides|offer|offers|help|assist|work through|obtain|get you|transfer|transfers|happy to|available|open to)\b/i;
const QUESTION = /\b(whether|if you|do you|will you|would you|are you|please (indicate|note whether))\b/i;

function visa(ss: string[]): { f: Field<"yes" | "no">; amb: string[] } {
  const yes: string[] = [], no: string[] = [], amb: string[] = [];
  for (const s of ss) {
    if (!VISA_TOPIC.test(s) || s.length > 500) continue;
    if (/\bu\.?s\.? persons?\b/i.test(s) && /\b(lawful permanent|green card|asylee|refugee)\b/i.test(s)) continue; // ITAR definition, not sponsorship
    if (/\b(visa (card|payments?|network|direct)|sponsor(ed)? (events?|hackathons?|teams?)|sponsors? (of|for) (the|our)|company[- ]sponsored|sponsored (medical|health|benefits?|plans?|insurance|401))/i.test(s) && !/\b(visas?|h-?1b|immigration)\b/i.test(s)) continue;
    // "without sponsorship" inside an authorization requirement = no sponsorship
    if (/without (the )?(need (for|of) )?(current or future |future |any )?(employer[- ]|visa |employment[- ]|immigration )?sponsor/i.test(s)) { no.push(s); continue; }
    if (QUESTION.test(s) && !NEG.test(s)) { amb.push(s); continue; }
    if (NEG.test(s)) {
      // "no matter" / "not only" style false negations are rare; flag mixed sentences
      if (/\b(transfer|transfers)\b/i.test(s) && /\bnew\b/i.test(s)) no.push(s); // transfers only, no new sponsorship
      else no.push(s);
    } else if (POS.test(s)) yes.push(s);
    else amb.push(s);
  }
  const f = empty<"yes" | "no">();
  const ambiguity: string[] = [];
  if (yes.length && no.length) { ambiguity.push("visa: both yes and no statements"); f.conflict = true; f.evidence = [...no, ...yes].slice(0, 3).map(jd); }
  else if (no.length) { f.value = "no"; f.evidence = no.slice(0, 2).map(jd); f.method = "regex"; }
  else if (yes.length) { f.value = "yes"; f.evidence = yes.slice(0, 2).map(jd); f.method = "regex"; }
  if (amb.length) ambiguity.push("visa: unparsed visa mention");
  return { f, amb: ambiguity };
}

function relocation(ss: string[]): Field<"yes" | "no"> {
  const f = empty<"yes" | "no">();
  for (const s of ss) {
    if (!/\brelocat\w*/i.test(s) || s.length > 500) continue;
    if (/\b(no|not|unable|cannot|n't|without)\b[^.]{0,40}relocat|relocat\w*[^.]{0,30}\b(not (available|provided|offered|supported))/i.test(s)) {
      f.value = "no"; f.evidence = [jd(s)]; f.method = "regex"; return f;
    }
    if (/relocat\w*[^.]{0,40}\b(assistance|support|package|stipend|bonus|available|provided|offered|covered|help)|\b(offer|provide|support|cover|assist|help)\w*[^.]{0,40}relocat|willing(ness)? to relocate|open to relocat/i.test(s)) {
      if (/willing(ness)? to relocate|open to relocat|must (be able to )?relocate|able to relocate/i.test(s) && !/\b(assist|support|package|help|stipend|cover)/i.test(s)) continue; // candidate requirement, not support
      f.value = "yes"; f.evidence = [jd(s)]; f.method = "regex"; return f;
    }
  }
  return f;
}

function citizenship(ss: string[]): Field<{ country: string; kind: "citizen" | "us_person" | "clearance" | "work_authorization" }> {
  const f = empty<{ country: string; kind: "citizen" | "us_person" | "clearance" | "work_authorization" }>();
  const rank = { work_authorization: 0, us_person: 1, clearance: 2, citizen: 3 } as const;
  let best: { country: string; kind: keyof typeof rank; s: string } | null = null;
  const consider = (country: string, kind: keyof typeof rank, s: string) => {
    if (!best || rank[kind] > rank[best.kind]) best = { country, kind, s };
  };
  for (const s of ss) {
    if (s.length > 600) continue;
    if (/without regard to|regardless of|protected (class|characteristic)|equal opportunity|discriminat/i.test(s)) continue;
    const req = /\b(must|required|requires|requirement|need to|needs to|only|eligible|eligibility|able to obtain|ability to obtain|obtain and maintain|maintain)\b/i.test(s);
    if (!req) continue;
    if (/\b(desirable|preferred|a plus|nice to have|bonus)\b/i.test(s) && !/\b(must|required)\b/i.test(s)) continue;
    if (/\bu\.?s\.? persons?\b|\bitar\b|export control|\bEAR\b/.test(s) || /\bu\.?s\.? persons?\b|\bitar\b|export control/i.test(s)) consider("US", "us_person", s);
    else if (/\b(u\.?s\.?|united states|american) citizen(ship)?\b|\bcitizen(ship)? of the (u\.?s\.?|united states)/i.test(s)) consider("US", "citizen", s);
    if (/\b(security|secret|ts\/sci|top secret|government|dod|public trust) clearance\b|\bclearance (is )?required\b|\bactive (secret|ts)/i.test(s)) consider("US", "clearance", s);
    const wa = s.match(/\b(authori[sz]ed to work|work authori[sz]ation|right to work|eligible to work|legally (able|eligible|permitted) to work)\b[^.]{0,40}?\b(in|for)\s+(the\s+)?([A-Z][\w.]+(\s+[A-Z][\w.]+){0,3})/);
    if (wa) {
      const p = findPlaces(wa[0])[0];
      if (p) consider(p.code, "work_authorization", s);
    }
  }
  if (best) {
    const b = best as { country: string; kind: keyof typeof rank; s: string };
    f.value = { country: b.country, kind: b.kind }; f.evidence = [jd(b.s)]; f.method = "regex";
  }
  return f;
}

// ---------------------------------------------------------------- years
const NUM: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s.toLowerCase()]);
const NUMW = "(\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)";
const YEARS_RE = new RegExp(
  `(?:(?:minimum|min\\.?|at least|over|more than)\\s+(?:of\\s+)?)?(?:\\(?${NUMW}\\)?)\\s*(?:\\+|plus)?\\s*(?:(?:-|–|—|to)\\s*${NUMW}\\s*\\+?\\s*)?(?:years?|yrs?)(?:'|’)?\\b(?![^.]{0,12}\\b(ago|old|from now|of age)\\b)`,
  "gi",
);
const PREFERRED_HEAD = /^(preferred|nice[- ]to[- ]haves?|bonus|pluses|bonus points|it'?s a plus|good to have|desired|ideal(ly)?|extra credit)\b/i;

function years(ss: string[]): { min: Field<number>; max: Field<number>; amb: string[] } {
  const min = empty<number>(), max = empty<number>();
  const amb: string[] = [];
  let inPreferred = false;
  const req: { lo: number; hi: number | null; s: string }[] = [];
  for (const s of ss) {
    if (s.length < 80 && /:\s*$/.test(s)) inPreferred = PREFERRED_HEAD.test(s) || /\b(preferred|nice to have|bonus)\b/i.test(s);
    else if (s.length < 60 && /^(requirements|qualifications|what you|you have|about you|who you are|minimum|basic)/i.test(s)) inPreferred = false;
    if (s.length > 500) continue;
    if (!/\bexperience|\bexp\b|\bbackground|\bworking (in|on|with)|\bbuilding|\bin (industry|software|engineering|product)|professional/i.test(s)) continue;
    if (/\b(preferred|nice to have|a plus|is a bonus|bonus points|ideally)\b/i.test(s) && !/\b(required|must|minimum)\b/i.test(s)) continue;
    if (/\b(we have|our team has|company|founded|years? (ago|old)|in business|track record of \d+ years)\b/i.test(s) && !/\byou\b/i.test(s)) continue;
    if (inPreferred) continue;
    for (const m of s.matchAll(YEARS_RE)) {
      const lo = n(m[1]);
      const hi = m[2] ? n(m[2]) : null;
      if (lo == null || lo > 25 || (hi != null && hi < lo)) continue;
      req.push({ lo, hi, s });
    }
  }
  if (req.length) {
    const top = req.reduce((a, b) => (b.lo > a.lo ? b : a));
    min.value = top.lo; min.evidence = [jd(top.s)]; min.method = "regex";
    if (top.hi != null) { max.value = top.hi; max.evidence = [jd(top.s)]; max.method = "regex"; }
    if (new Set(req.map((r) => r.lo)).size > 1) amb.push("years: multiple different year requirements");
  }
  return { min, max, amb };
}

// ---------------------------------------------------------------- onsite days
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
function onsiteDays(ss: string[], workplace: string | null): Field<number> {
  const f = empty<number>();
  for (const s of ss) {
    if (s.length > 500) continue;
    const office = /\b(in[- ]office|in the office|office|on[- ]?site|in[- ]person|hybrid|in-studio|at (our|the) (hq|headquarters))\b/i;
    if (!office.test(s)) continue;
    const m = s.match(new RegExp(`${NUMW}\\s*(?:\\+|or more)?\\s*(?:(?:-|–|to)\\s*${NUMW}\\s*)?(?:days?|x)\\s*(?:a|per|each|\\/|every)\\s*week`, "i"));
    if (m) { const v = n(m[1]); if (v != null && v <= 5) { f.value = v; f.evidence = [jd(s)]; f.method = "regex"; return f; } }
    // "onsite Tuesday, Wednesday, and Thursday, with optional presence on Monday and Friday" => 3
    const required = s.split(/\boptional\w*\b/i)[0];
    // "Monday through Thursday" / "Mon-Thu" style ranges
    const range = required.match(/\b(monday|tuesday|wednesday|thursday|friday)s?\s*(?:through|thru|to|-|–)\s*(monday|tuesday|wednesday|thursday|friday)s?\b/i);
    if (range) {
      const k = DAYS.indexOf(range[2].toLowerCase()) - DAYS.indexOf(range[1].toLowerCase()) + 1;
      if (k >= 1 && k <= 5) { f.value = k; f.evidence = [jd(s)]; f.method = "regex"; return f; }
    }
    const named = DAYS.filter((d) => new RegExp(`\\b${d}s?\\b`, "i").test(required)).length;
    if (named >= 2) { f.value = named; f.evidence = [jd(s)]; f.method = "regex"; return f; }
    if (/\b(fully|100%|full[- ]time)\s+(in[- ]office|on[- ]?site|in[- ]person)\b|\b(five|5) days in (the )?office\b/i.test(s) && !/\bnot\b/i.test(s)) { f.value = 5; f.evidence = [jd(s)]; f.method = "regex"; return f; }
  }
  if (workplace && /remote/i.test(workplace)) {
    // explicit fully remote statement
    const s = ss.find((x) => /\b(this|the) (role|position|job) is (a )?(fully|100%|completely) remote\b|\b(fully|100%|completely) remote (role|position)\b/i.test(x) && x.length < 400);
    if (s) { f.value = 0; f.evidence = [jd(s)]; f.method = "regex"; }
  }
  return f;
}

// ---------------------------------------------------------------- timezone
const TZ = /\b(PST|PDT|PT|Pacific|MST|MT|Mountain|CST|CT|Central|EST|EDT|ET|Eastern|GMT|UTC|BST|CET|CEST|EET|IST|AEST|SGT|JST)\b(\s*[+-]\s*\d{1,2}(:\d\d)?)?/g;
function timezone(ss: string[]): Field<Timezone> {
  const f = empty<Timezone>();
  for (const s of ss) {
    if (s.length > 500) continue;
    if (!/\b(time ?zones?|overlap|hours|working hours|business hours|core hours|aligned|alignment)\b/i.test(s)) continue;
    const zones = uniq([...s.matchAll(TZ)].map((m) => (m[0].replace(/\s+/g, "")))).filter((z) => !/^(PT|MT|CT|ET)$/.test(z) || /\b(PT|MT|CT|ET)\b(?!\w)/.test(s));
    const ov = s.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?hours?\s+(?:of\s+)?(?:daily\s+)?overlap|overlap[^.]{0,60}?(\d{1,2})\s*\+?\s*hours?/i);
    const region = /\b(us|u\.s\.|north american|european|americas|emea|apac|east coast|west coast)\s+(time ?zones?|hours|business hours)\b/i.exec(s);
    if (!zones.length && !ov && !region) continue;
    const oh = ov ? Number(ov[1] ?? ov[2]) : null;
    f.value = { zones: zones.length ? zones : region ? [region[0]] : [], overlap_hours: oh != null && oh >= 1 && oh <= 10 ? oh : null };
    f.evidence = [jd(s)]; f.method = "regex";
    return f;
  }
  return f;
}

// ---------------------------------------------------------------- pay
const CUR: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "₹": "INR" };
function money(v: string, k?: string) { const x = Number(v.replace(/,/g, "")); return k && /k/i.test(k) ? x * 1000 : x; }
function pay(ss: string[]): Field<Pay> {
  const f = empty<Pay>();
  const re = /(CA\$|C\$|A\$|US\$|\$|£|€|₹)\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K)?\s*(?:USD|CAD|EUR|GBP)?\s*(?:-|–|—|to)\s*(?:CA\$|C\$|A\$|US\$|\$|£|€|₹)?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K)?\s*(USD|CAD|EUR|GBP|AUD)?/;
  for (const s of ss) {
    if (s.length > 600) continue;
    const m = s.match(re);
    if (!m) continue;
    let lo = money(m[2], m[3]), hi = money(m[4], m[5] ?? m[3]);
    if (!m[3] && m[5] && lo < 1000) lo *= 1000;
    const period: Pay["period"] = /\b(per hour|\/ ?hr|\/ ?hour|hourly|an hour)\b/i.test(s) ? "hour" : /\b(per month|\/ ?mo|monthly)\b/i.test(s) ? "month" : hi >= 10_000 ? "year" : null;
    if (period === "year" && (lo < 10_000 || hi > 5_000_000)) continue;
    if (/\b(raised|funding|valuation|series [a-e]|revenue|arr\b|million|billion|bn\b)\b/i.test(s) && !/\b(salary|compensation|pay|base|range|ote)\b/i.test(s)) continue;
    const sym = m[1];
    const currency = m[6] ?? (sym === "CA$" || sym === "C$" ? "CAD" : sym === "A$" ? "AUD" : sym === "US$" ? "USD" : CUR[sym] ?? null);
    f.value = { min: lo, max: hi, currency, period };
    f.evidence = [jd(s)]; f.method = "regex";
    return f;
  }
  return f;
}

// ---------------------------------------------------------------- main
export function extractRegex(job: JobInput): Extraction {
  const text = job.description_text ?? "";
  const ss = sentences(text);
  const ambiguity: string[] = [];
  const wp = (job.labels?.workplace ?? job.workplace_type ?? "").toLowerCase();
  const isRemote = job.remote || /remote/.test(wp);
  const isOnsiteish = /onsite|on-site|hybrid/.test(wp);

  // geo
  const locCodes = parseLocationField(job.location);
  const g = geoFromJd(ss);
  const geo = empty<Geo>();
  const locEv: Evidence[] = job.location ? [{ quote: job.location, from: "location" }] : [];
  const remoteLoc = /remote/i.test(job.location ?? "");
  if (isRemote || remoteLoc) {
    const allowed = uniq([...(remoteLoc ? locCodes : []), ...g.allowed.map((a) => a.code)]);
    const excluded = uniq(g.excluded.map((a) => a.code));
    if (allowed.length) {
      geo.value = { mode: "restricted", allowed, excluded };
      geo.evidence = [...(remoteLoc && locCodes.length ? locEv : []), ...uniq(g.allowed.map((a) => a.quote)).slice(0, 2).map(jd)];
      geo.method = "regex";
      if (g.world.length && !g.notWorld.length) { ambiguity.push("geo: worldwide statement alongside restriction"); geo.conflict = true; }
    } else if (g.world.length && !g.notWorld.length) {
      geo.value = { mode: "anywhere", allowed: [], excluded };
      geo.evidence = g.world.slice(0, 2).map(jd); geo.method = "regex";
    } else if (excluded.length) {
      ambiguity.push("geo: exclusions without allow-list");
    }
    if (isOnsiteish) ambiguity.push("geo: remote flag plus onsite/hybrid workplace");
    if (g.notWorld.length) ambiguity.push("geo: 'not borderless'-style statement");
  } else if (locCodes.length) {
    geo.value = { mode: "onsite", allowed: locCodes, excluded: [] };
    geo.evidence = locEv; geo.method = "api";
    if (g.allowed.length && g.allowed.some((a) => /\bremote/i.test(a.quote))) ambiguity.push("geo: onsite job mentions remote eligibility");
  } else {
    ambiguity.push("geo: no usable location");
  }

  const v = visa(ss);
  ambiguity.push(...v.amb);
  const y = years(ss);
  ambiguity.push(...y.amb);

  return {
    job_id: job.id,
    geo,
    visa_sponsorship: v.f,
    relocation: relocation(ss),
    citizenship: citizenship(ss),
    min_years: y.min,
    max_years: y.max,
    timezone: timezone(ss),
    onsite_days: onsiteDays(ss, wp || null),
    pay: pay(ss),
    ambiguity,
  };
}
