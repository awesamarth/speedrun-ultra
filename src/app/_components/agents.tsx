import { headers } from "next/headers";
import { searchSchema, toProfile } from "@/lib/format";
import { COUNTRY_NAME } from "@/lib/geo";
import { AgentPrompt } from "./agent-prompt";
import { CopyButton } from "./copy-button";
import { ConnectTabs } from "./connect-tabs";
import { AgentDisclosure } from "./agent-disclosure";

type SearchParams = Record<string, string | string[] | undefined>;

function profilePrompt(sp: SearchParams, origin: string) {
  // works whether or not the MCP server is connected: unconnected agents fall back to llms.txt + JSON API
  const via = `Using speedrun-ultra (if it isn't connected as a tool, read ${origin}/llms.txt and use its JSON API)`;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ""));
  if (!raw.country) { raw.country = "IN"; raw.years ??= "3"; }
  const parsed = searchSchema.safeParse(raw);
  const instructions = "Show the evidence quotes and canonical job links. List unclear roles separately; don't treat them as eligible. Ask me about any missing work-authorization details. Never apply on my behalf.";
  if (!parsed.success) return `${via}, find roles I can actually apply to. Ask me for my country, experience and work authorization first. ${instructions}`;
  const input = parsed.data;
  const profile = toProfile(input);
  if ("error" in profile) return `${via}, find roles I can actually apply to. Ask me for my country, experience and work authorization first. ${instructions}`;

  const name = (code: string) => COUNTRY_NAME[code] ?? code;
  const parts = [`I live in ${name(profile.country)}${profile.years !== undefined ? ` and have ${profile.years} ${profile.years === 1 ? "year" : "years"} of experience` : ""}.`];
  if (profile.authorized_in?.length) parts.push(`I can also work in ${profile.authorized_in.map(name).join(", ")} without a visa.`);
  if (profile.citizen_of?.length) parts.push(`My citizenships: ${profile.citizen_of.map(name).join(", ")}.`);
  parts.push(profile.open_to_relocation ? "I'm open to relocating if an employer sponsors a visa." : "Don't include office jobs in other countries unless I already have work authorization there.");
  const workplace = input.show === "remote" ? "remote " : input.show === "office" ? "onsite or hybrid " : "";
  const role = input.function ? `${input.function} roles` : "engineering and product roles";
  parts.push(`${via}, find ${workplace}${role} I can actually apply to.`);
  if (input.q) parts.push(`Search keywords: ${JSON.stringify(input.q)}.`);
  if (input.level?.length) parts.push(`Only these levels: ${input.level.join(", ")}.`);
  if (input.min_salary) {
    parts.push(`Keep roles whose posted pay band reaches at least $${input.min_salary.toLocaleString("en-US")} USD/year.`);
    parts.push(input.include_no_salary ? "Also include roles with no posted pay." : "Exclude roles with no posted pay.");
  }
  parts.push(instructions);
  return parts.join(" ");
}

export async function Agents({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [h, sp] = await Promise.all([headers(), searchParams]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const url = `${origin}/mcp`;
  const prompt = profilePrompt(sp, origin);

  return (
    <AgentDisclosure title="Use it from your agent" subtitle="Connect your agent to check eligibility, with quotes and links.">
      <div className="agent-content">
      <div className="agent-setup">
        <div className="agent-step-heading"><h3 className="eyebrow">01 · Connect</h3><span className="agent-hint">Remote MCP</span></div>
        <div className="mcp-url"><code>{url}</code><CopyButton text={url} label="Copy URL" ariaLabel="Copy MCP URL" /></div>
        <ConnectTabs url={url} origin={origin} />
        <p className="agent-hint agent-privacy">No auth. Your profile is never stored.</p>
      </div>
      <AgentPrompt key={prompt} initialPrompt={prompt} />
      <div className="agent-resources">
        <span className="eyebrow">Developer resources</span>
        <a href="/llms.txt">llms.txt ↗</a><a href="/SKILL.md">SKILL.md ↗</a>
        <a href="/api/jobs?country=IN&years=3&show=remote" target="_blank" rel="noreferrer">JSON API ↗</a>
        <a href="/api/stats?country=IN" target="_blank" rel="noreferrer">Index stats ↗</a>
      </div>
      </div>
    </AgentDisclosure>
  );
}
