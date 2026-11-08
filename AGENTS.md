<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# speedrun-ultra

Eligibility layer for the a16z speedrun talent board. It extracts country eligibility, visa sponsorship, citizenship/clearance, years, timezone, onsite days and pay from job descriptions, with verbatim quotes, and checks them against a candidate profile (eligible / not_eligible / unclear). It ships as a web page, a JSON API and a remote MCP server.

## Layout

- `scripts/ingest.ts`: pulls engineering + product roles and full JDs from the board's public API (`?source=speedrun-ultra`, throttled, retried, cached incrementally).
- `src/lib/extract/`: regex extractor (`regex.ts`), sentence/snippet helpers (`text.ts`), regex + LLM merge (`combine.ts`).
- `scripts/llm/`: LLM extraction batches (`PROMPT.md` schema, `prepare.ts`, `check.ts`, `merge.ts`). Every LLM quote must appear verbatim in the JD or it's dropped.
- `scripts/eval/`: gold-set sampling and per-field precision/recall (`eval.ts` writes `src/data/accuracy.json`).
- `scripts/build-index.ts`: builds the final index and loads it into Cloudflare D1.
- `src/lib/eligibility.ts`: verdict logic. `src/lib/store.ts`: in-memory index + search. `src/lib/format.ts`: API/MCP input and output shapes. `src/lib/mcp.ts`: MCP server.
- `src/app/`: pages (`/`, `/health`, `/method`), API routes (`/api/jobs`, `/api/jobs/[id]`, `/api/stats`), `/mcp`, `/llms.txt`, `/SKILL.md`, `/docs.md`.

## Commands

- `bun run dev`: local dev server (reads local D1 from `.wrangler/state`).
- `bun scripts/ingest.ts`: refresh the job cache.
- `bun scripts/llm/prepare.ts --size 50 --only-missing`: batch new JDs for LLM extraction; then `bun scripts/llm/merge.ts`.
- `bun scripts/build-index.ts [--remote]`: rebuild the index into local or remote D1.
- `bun scripts/eval/eval.ts`: accuracy report against the gold set.
- `bun run deploy`: build with OpenNext and deploy to Cloudflare Workers.

## Conventions

- Bun for everything (`bun`, `bunx`). TypeScript, Next.js 16 App Router, Tailwind v4.
- Never guess: a field without evidence is `unknown`; regex/LLM disagreement is a conflict and can never produce an `eligible` verdict.
- Always link to the board's canonical job `url`; don't re-host listings or full JD text.
- Candidate profiles are passed per request and never stored.
- Working caches, labels and notes live in `internal/` (gitignored). Never commit secrets (`.env*`, `.dev.vars*`).
