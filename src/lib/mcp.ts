import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchShape, profileShape, toProfile, toSearchOpts, searchOut, jobOut, toCountry } from "./format";
import { search, getJob, stats } from "./store";

export const INSTRUCTIONS = `speedrun-ultra answers "can this person actually apply to this job from where they are?" for engineering and product roles on the a16z speedrun talent board (speedrun-talent-network.com). Every verdict is backed by verbatim quotes from the job description.

Rules:
1. Ask the user for: the country they live and can legally work in (plus any other countries they can already work in), years of experience, and whether they'd relocate to another country if a visa were sponsored. Never assume these. Pass them on every call; nothing is stored.
2. Verdicts: "eligible" = passes location, work authorization, citizenship/clearance and stated-minimum-years checks with evidence. It is NOT a fit judgement: skills, seniority fit, education/student status and timezone are not checked. "not_eligible" = the posting rules them out (quote shown). "unclear" = the posting doesn't say or contradicts itself; never present it as eligible.
3. Use the level filter (e.g. level=junior,mid) when the user's experience makes internships or staff/exec roles irrelevant, and mention each result's level.
4. Always show the job's url and the quotes behind each verdict, and surface timezone, onsite-days and data-health facts when present.
5. For skills/fit questions, read the full posting from the result's full_description link (the board's own API) instead of guessing.
6. Never apply to jobs or fill application forms on the user's behalf. Give them the link.
7. Extraction is automated (regex + LLM, quotes verified against the text) and can be wrong. Suggest the user confirm on the posting.
Filters: show (remote/office/both), level, min_salary (annual USD; non-USD converted approximately), q (keywords matched against titles, labels and the job description, so skills like "MCP" or "rust" work; each result says matched_in), function. Pages start at 0: pass next_page from the previous response; has_more=false means you have everything. Use check_job for full field-by-field evidence on one role.`;

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });

export const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({ name: "speedrun-ultra", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "find_eligible_jobs",
    {
      title: "Find jobs this candidate can apply to",
      description:
        "Filter speedrun talent board engineering/product roles by a candidate profile (where they can work, relocation, years) plus optional remote/office, level and salary filters. Returns roles with verdict eligible (and optionally unclear), each with reasons, verbatim quotes, level, posted pay, data-health flags and the canonical job url. Pages start at 0; use next_page.",
      inputSchema: z.object(searchShape),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const p = toProfile(args);
      if ("error" in p) return { ...text({ error: p.error }), isError: true };
      const opts = toSearchOpts(args, 10);
      return text(searchOut(p, await search(p, opts), opts));
    },
  );

  server.registerTool(
    "check_job",
    {
      title: "Check one job",
      description: "Field-by-field extracted eligibility data (with quotes) for one job, by id, 8-char id prefix, or speedrun job url. Pass a profile to also get a verdict.",
      inputSchema: z.object({
        id_or_url: z.string().describe("Job id, its first 8 hex chars, or the speedrun-talent-network.com job url."),
        country: profileShape.country.optional(),
        years: profileShape.years,
        open_to_relocation: profileShape.open_to_relocation,
        authorized_in: profileShape.authorized_in,
        citizen_of: profileShape.citizen_of,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const j = await getJob(args.id_or_url);
      if (!j) return { ...text({ error: "Job not found in the index (it may be closed, or outside engineering/product)." }), isError: true };
      let profile;
      if (args.country) { const p = toProfile({ ...args, country: args.country }); if ("error" in p) return { ...text({ error: p.error }), isError: true }; profile = p; }
      return text(jobOut(j, profile));
    },
  );

  server.registerTool(
    "index_stats",
    {
      title: "Index stats",
      description: "Size and freshness of the index, how many remote roles are open to a given country, visa sponsorship counts, and data-health counts.",
      inputSchema: z.object({ country: z.string().optional().describe("ISO2 or name; default IN.") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ country }) => text(await stats(toCountry(country) ?? "IN")),
  );

  return server;
}, { responseMode: "json" });
