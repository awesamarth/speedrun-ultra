# speedrun-ultra

**Can you actually apply to this job from where you are?**

The [a16z speedrun talent board](https://speedrun-talent-network.com/jobs) labels roles *remote*, but not *remote from where*, and it has no visa field. Those answers are usually already in the job description. speedrun-ultra extracts them, with verbatim quotes, for every engineering and product role on the board, and checks them against a candidate's profile.

Live: **https://speedrun-ultra.awesamarth.dev**

## What it extracts

Per role, each with a quote from the JD (or `unknown` when the JD doesn't say):

- where you can work from (countries / regions allowed and excluded, or office location)
- visa sponsorship and relocation help
- citizenship, security clearance or ITAR "US person" requirements
- minimum / maximum years of experience
- timezone or overlap requirements, onsite days per week
- pay stated in the text

The verdict is `eligible` only when every check has evidence; `unclear` is never treated as a yes. "Eligible" covers location, work authorization, citizenship/clearance and stated years. It is not a judgement of skills or seniority fit.

## How it works

1. Pull every engineering and product role, with its full JD, from the board's public API (throttled, cached, refreshed incrementally; tagged `source=speedrun-ultra`).
2. Regex and heuristics extract each field; an LLM reads the eligibility-relevant sentences of each JD with a strict JSON schema.
3. Every LLM quote must appear verbatim in the JD or it's dropped. When regex and LLM disagree, the field is marked conflicting and can never make a role "eligible".
4. Accuracy is measured on a hand-checked gold set; see [/method](https://speedrun-ultra.awesamarth.dev/method).

## Use it

- **Web:** profile form, results with evidence, and a [data-health view](https://speedrun-ultra.awesamarth.dev/health) of gaps in the board's labels.
- **MCP:** `https://speedrun-ultra.awesamarth.dev/mcp` (Streamable HTTP, no auth). Tools: `find_eligible_jobs`, `check_job`, `index_stats`.
  ```
  claude mcp add --transport http speedrun-ultra https://speedrun-ultra.awesamarth.dev/mcp
  ```
- **Agents without MCP:** [`/llms.txt`](https://speedrun-ultra.awesamarth.dev/llms.txt), [`/SKILL.md`](https://speedrun-ultra.awesamarth.dev/SKILL.md), [`/docs.md`](https://speedrun-ultra.awesamarth.dev/docs.md).
- **JSON API:** `GET /api/jobs?country=IN&years=3&show=remote`, `GET /api/jobs/{id}`, `GET /api/stats?country=IN`.

Profiles are passed per request and never stored. Agents are told to ask before assuming and never to apply on a user's behalf.

## Stack

Next.js 16 (App Router) on Cloudflare Workers via OpenNext, Cloudflare D1, the MCP TypeScript SDK, Bun.

```
bun install
bun run dev            # local, reads local D1
bun run deploy         # OpenNext build + deploy
```

Pipeline scripts are in `scripts/` (ingest, LLM extraction, eval, index build). See `AGENTS.md` for the layout.

Independent project, not affiliated with a16z or speedrun. Data comes from the board's public API; listings link to their canonical pages.
