// Agent-facing docs, rendered with the request origin so URLs are absolute.
import { INSTRUCTIONS } from "./mcp";

export function originOf(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const skillMd = (o: string) => `---
name: speedrun-ultra
description: Check whether a candidate can actually apply to engineering/product roles on the a16z speedrun talent board from their country (country eligibility, visa sponsorship, citizenship/clearance, years), with verbatim JD quotes. Use when a user asks which speedrun/a16z-portfolio jobs they can apply to, or whether a specific speedrun job is open to them.
---

# speedrun-ultra

MCP server: \`${o}/mcp\` (Streamable HTTP, no auth). JSON API: \`${o}/api/jobs\`. Docs: ${o}/llms.txt

## When to use
- "Which speedrun / a16z portfolio roles can I apply to from <country>?" → \`find_eligible_jobs\`
- "Can I apply to <speedrun job url>?" → \`check_job\` with the user's profile
- "How many remote roles are open to <country>?" → \`index_stats\`

## Before calling
Ask the user for: the **country** they live and can legally work in (plus any others they're already authorized in), **years** of experience, and whether they'd **relocate abroad with visa sponsorship**. Never assume or guess these. Nothing is stored; pass them on every call.

## Verdicts
- \`eligible\`: passes location, work-authorization, citizenship/clearance and stated-years checks with evidence. **Not a fit judgement**: skills, level, education/student status and timezone aren't checked.
- \`not_eligible\`: the posting rules the user out. Show the quote.
- \`unclear\`: the posting doesn't say, or contradicts itself. **Never present unclear as eligible.** Say what's missing.

## Always
- Show each job's \`url\`, its \`level\` and the quotes behind the verdict; mention timezone/onsite facts and data-health flags.
- Use \`level\` (e.g. \`junior,mid\`) to drop internships or staff/exec roles that don't fit. For skills fit, read \`full_description\`.
- Say extraction is automated and may be wrong. The posting is the source of truth.
- Paginate: pages start at **0**; pass \`next_page\` until \`has_more\` is false.

## Never
- Apply, fill forms, or contact companies on the user's behalf. Give them the link.
`;

export const llmsTxt = (o: string) => `# speedrun-ultra

> Eligibility layer for the a16z speedrun talent board (speedrun-talent-network.com). For every engineering and product role it extracts, from the job description text and with verbatim quotes, the fields the board doesn't have: which countries/regions you can work from, visa sponsorship, relocation help, citizenship/clearance/ITAR requirements, min/max years, timezone and onsite days, pay. It then checks them against a candidate profile and returns eligible / not_eligible / unclear.

Data comes from the board's public API, attributed with source=speedrun-ultra. Results always link to the board's canonical job url. Candidate profiles are passed per request and never stored.

## Use from an agent
- [SKILL.md](${o}/SKILL.md): when to use it, what verdicts mean, and the rules (ask, don't assume; unclear ≠ eligible; show quotes + links; never apply on the user's behalf)
- MCP server: ${o}/mcp (Streamable HTTP, stateless, no auth). Tools: find_eligible_jobs, check_job, index_stats
- [Full docs (markdown)](${o}/docs.md)

## JSON API
- [GET /api/jobs](${o}/api/jobs?country=IN&years=3&show=remote): search by profile. Params: country (required), authorized_in, open_to_relocation, years, citizen_of, show (remote|office|both), level (intern,new_grad,junior,mid,senior,staff,lead), min_salary (annual USD), include_no_salary, function (engineering|product), q, include_unclear, page (starts at 0; use next_page), limit (≤50)
- [GET /api/jobs/{id}](${o}/api/jobs/815547bf?country=IN&years=3): one job, every field with quotes. Takes an id, an 8-char prefix, or the url-encoded speedrun job url. Optional profile params add a verdict.
- [GET /api/stats](${o}/api/stats?country=IN): index size, remote roles open to a country, visa counts, data-health counts
`;

export const docsMd = (o: string) => `# speedrun-ultra docs

${llmsTxt(o).split("\n").slice(2).join("\n")}

## MCP server instructions (sent on initialize)

${INSTRUCTIONS}

## Verdict logic
A job is evaluated against the profile with these checks. Any **fail** → \`not_eligible\`. Otherwise any **unknown** → \`unclear\`. Otherwise \`eligible\`.

| check | pass | fail | unknown |
|---|---|---|---|
| location | remote from a list that includes your country (or one you're authorized in); explicitly worldwide; office in a country you can work in; office abroad and you're open to relocating | remote only from elsewhere; your country excluded; office abroad and you're not relocating | no location evidence, or regex and LLM disagree |
| work_authorization (office abroad you'd relocate to, or a stated work-authorization requirement you don't meet) | employer sponsors visas | employer won't sponsor; or you're not relocating | sponsorship not mentioned |
| citizenship (citizen / clearance / ITAR "US person") | you listed that citizenship | you're outside that country (or listed other citizenships) | you're in that country; confirm you qualify |
| experience (only if you gave years) | stated minimum ≤ your years | stated minimum > your years | regex and LLM disagree on the minimum |

**What "eligible" does not mean:** it only covers the four checks above. Skills, level fit, education or student status, timezone and other requirements are not evaluated, so an internship or a staff role can be "eligible" for anyone allowed to work there. Use the \`level\` filter and read the posting (\`full_description\`) for fit.

Missing years is not a blocker. Timezone, onsite days and pay are returned as facts and don't gate the verdict. Pay comes from the board's comp fields, else from the JD text; min_salary compares the band's top end with the floor (non-USD converted with rough fixed rates).

## Extracted fields
\`where_you_can_work\` {mode: onsite|restricted|anywhere, allowed[], excluded[]} · \`visa_sponsorship\` yes|no · \`relocation_help\` yes|no · \`legal_requirement\` {kind: citizen|clearance|us_person|work_authorization, country} · \`min_years\` · \`max_years\` · \`timezone\` {zones[], overlap_hours} · \`onsite_days_per_week\` · \`pay\` {min,max,currency,period}

Each field has \`value\` ("unknown" when there's no evidence), \`quotes\` (verbatim from the JD or the location field), \`source\` (regex | llm | both | api), and \`conflict: true\` when regex and LLM disagree.

## Search response
\`profile_used\`, \`filters_used\`, \`eligible_means\`, \`counts_all_verdicts\`, \`total_matching\`, \`page\` (starts at 0), \`page_size\`, \`has_more\`, \`next_page\`, \`warnings\` (e.g. page past the end), \`results[]\`.

Each result: \`id\` (8 chars, works with /api/jobs/{id} and check_job), \`title\`, \`company\`, \`url\` (canonical board page), \`location\`, \`workplace\`, \`posted\`, \`pay\`, \`level\` (intern | new_grad | junior | mid | senior | staff | lead | null), \`board_labels\` (seniority, employment_type, min_experience as the board publishes them), \`data_health\`, \`verdict\`, \`reasons[]\` (check, status, reason, quotes), \`facts\`, \`full_description\` (the board's own API for the full posting text; we don't re-host it).

## Data-health flags
- \`remote_conflict\`: the board's remote flag disagrees with its workplace label. Verdicts use the location/JD evidence shown in the reasons, not the flag.
- \`remote_label_jd_office\`: labelled remote, but the JD requires an office.
- \`hidden_restriction\`: location just says "Remote", but the JD restricts the country.
- \`min_exp_in_text_only\` / \`pay_in_text_only\`: the board has no label, but the JD states years / pay.
- \`missing_workplace\`, \`missing_location\`, \`function_mismatch\`, \`duplicate\`: board metadata gaps.

Country codes are ISO 3166-1 alpha-2. Regions: NORTH_AMERICA, US_CANADA, AMERICAS, LATAM, EU, EUROPE, EMEA, MENA, AFRICA, APAC, ASIA.
`;
