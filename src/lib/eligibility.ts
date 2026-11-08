// Candidate profile x extracted job fields -> verdict with reasons + evidence.
// Principle: "eligible" only when every gating check has positive evidence. Missing or conflicting evidence => "unclear".
import type { Evidence, Field } from "./types";
import type { Final } from "./extract/combine";
import { codesInclude, COUNTRY_NAME, expandCodes } from "./geo";

export type Profile = {
  /** ISO2 country the candidate lives in and can work in */
  country: string;
  /** other countries the candidate can already work in without a visa */
  authorized_in?: string[];
  /** countries the candidate holds citizenship of (matters for citizen/clearance roles) */
  citizen_of?: string[];
  /** willing to move to another country if the employer sponsors a visa (default false) */
  open_to_relocation?: boolean;
  years?: number;
};

export type Verdict = "eligible" | "not_eligible" | "unclear";
export type CheckStatus = "pass" | "fail" | "unknown";
export type Check = { check: "location" | "work_authorization" | "citizenship" | "experience"; status: CheckStatus; reason: string; evidence: Evidence[] };
export type Result = { verdict: Verdict; checks: Check[] };

const name = (c: string) => COUNTRY_NAME[c] ?? c.replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
const list = (codes: string[]) => codes.map(name).join(", ");

export function evaluate(p: Profile, x: Final): Result {
  const checks: Check[] = [];
  const me = p.country.toUpperCase();
  const authorized = new Set([me, ...(p.authorized_in ?? []).map((c) => c.toUpperCase())]);
  const relocate = p.open_to_relocation ?? false;
  const geo = x.geo;
  const visa = x.visa_sponsorship;

  // ---- location + right to work there
  /** countries the role needs you to legally work in that you aren't authorized for */
  let needRights: string[] = [];
  if (!geo.value) {
    checks.push({ check: "location", status: "unknown", reason: "The posting doesn't say where you can work from.", evidence: geo.evidence });
  } else if (geo.conflict) {
    checks.push({ check: "location", status: "unknown", reason: "Location signals in the posting disagree; read it yourself.", evidence: geo.evidence });
  } else {
    const g = geo.value;
    if (g.excluded.length && codesInclude(g.excluded, me)) {
      checks.push({ check: "location", status: "fail", reason: `Excludes ${name(me)}.`, evidence: geo.evidence });
    } else if (g.mode === "anywhere") {
      checks.push({ check: "location", status: "pass", reason: "Open to candidates anywhere.", evidence: geo.evidence });
    } else if (g.mode === "restricted") {
      if (codesInclude(g.allowed, me)) checks.push({ check: "location", status: "pass", reason: `Remote from ${list(g.allowed)}, which includes ${name(me)}.`, evidence: geo.evidence });
      else {
        const viaAuth = expandCodes(g.allowed).filter((c) => authorized.has(c));
        if (viaAuth.length) checks.push({ check: "location", status: "pass", reason: `Remote from ${list(g.allowed)}; you can work in ${list(viaAuth)} (you'd need to live there).`, evidence: geo.evidence });
        else checks.push({ check: "location", status: "fail", reason: `Remote only from ${list(g.allowed)}.`, evidence: geo.evidence });
      }
    } else {
      // onsite / hybrid
      const offices = expandCodes(g.allowed);
      if (!offices.length) checks.push({ check: "location", status: "unknown", reason: "Office-based, but the office country is unclear.", evidence: geo.evidence });
      else if (offices.some((c) => authorized.has(c))) {
        const where = offices.filter((c) => authorized.has(c));
        checks.push({ check: "location", status: "pass", reason: `Office in ${list(where)}.`, evidence: geo.evidence });
      } else if (!relocate) {
        checks.push({ check: "location", status: "fail", reason: `Office in ${list(g.allowed)}; you're not open to relocating.`, evidence: geo.evidence });
      } else {
        needRights = offices;
        checks.push({ check: "location", status: "pass", reason: `Office in ${list(g.allowed)}; you'd relocate.`, evidence: geo.evidence });
      }
    }
  }

  // ---- work authorization (a country you'd have to work in without current rights)
  const authReq = x.citizenship.value;
  if (authReq?.kind === "work_authorization" && !authorized.has(authReq.country) && !needRights.includes(authReq.country)) {
    if (!relocate) checks.push({ check: "work_authorization", status: "fail", reason: `Requires authorization to work in ${name(authReq.country)}.`, evidence: x.citizenship.evidence });
    else needRights = [...needRights, authReq.country];
  }
  if (needRights.length) {
    const where = list(needRights.filter((c) => !authorized.has(c)));
    if (visa.conflict) checks.push({ check: "work_authorization", status: "unknown", reason: `You'd need a visa for ${where}; sponsorship statements conflict.`, evidence: visa.evidence });
    else if (visa.value === "yes") checks.push({ check: "work_authorization", status: "pass", reason: `You'd need a visa for ${where}; it says it sponsors.`, evidence: visa.evidence });
    else if (visa.value === "no") checks.push({ check: "work_authorization", status: "fail", reason: `You'd need a visa for ${where}; it won't sponsor.`, evidence: visa.evidence });
    else checks.push({ check: "work_authorization", status: "unknown", reason: `You'd need a visa for ${where}; sponsorship isn't mentioned.`, evidence: authReq?.kind === "work_authorization" ? x.citizenship.evidence : [] });
  }

  // ---- citizenship / clearance / ITAR
  if (authReq && authReq.kind !== "work_authorization") {
    const label = authReq.kind === "citizen" ? `${name(authReq.country)} citizenship` : authReq.kind === "clearance" ? `a ${name(authReq.country)} security clearance (citizens only, in practice)` : `${name(authReq.country)} person status (citizen or green card, ITAR/EAR)`;
    const isCitizen = p.citizen_of?.map((c) => c.toUpperCase()).includes(authReq.country);
    if (isCitizen) checks.push({ check: "citizenship", status: "pass", reason: `Requires ${label}; you hold it.`, evidence: x.citizenship.evidence });
    else if (p.citizen_of?.length && authReq.kind !== "us_person") checks.push({ check: "citizenship", status: "fail", reason: `Requires ${label}.`, evidence: x.citizenship.evidence });
    else if (!authorized.has(authReq.country)) checks.push({ check: "citizenship", status: "fail", reason: `Requires ${label}.`, evidence: x.citizenship.evidence });
    else checks.push({ check: "citizenship", status: "unknown", reason: `Requires ${label} — confirm you qualify.`, evidence: x.citizenship.evidence });
  }

  // ---- experience (missing = not a blocker; stated and above yours = fail)
  if (p.years != null) {
    const mn = x.min_years, mx = x.max_years;
    if (mn.value != null && !mn.conflict && mn.value > p.years) checks.push({ check: "experience", status: "fail", reason: `Asks for ${mn.value}+ years; you have ${p.years}.`, evidence: mn.evidence });
    else if (mn.value != null && mn.conflict && mn.value > p.years) checks.push({ check: "experience", status: "unknown", reason: `Experience requirement unclear (about ${mn.value}+ years).`, evidence: mn.evidence });
    else if (mx.value != null && !mx.conflict && p.years > mx.value + 1) checks.push({ check: "experience", status: "fail", reason: `Targets up to ${mx.value} years; you have ${p.years}.`, evidence: mx.evidence });
    else if (mn.value != null) checks.push({ check: "experience", status: "pass", reason: `Asks for ${mn.value}+ years.`, evidence: mn.evidence });
  }

  const verdict: Verdict = checks.some((c) => c.status === "fail") ? "not_eligible" : checks.some((c) => c.status === "unknown") ? "unclear" : "eligible";
  return { verdict, checks };
}

export type { Field };
