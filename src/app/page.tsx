import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { COUNTRY_NAME } from "@/lib/geo";
import { searchSchema, toProfile, toSearchOpts, hitOut } from "@/lib/format";
import { search, stats } from "@/lib/store";
import { CountryMultiSelect } from "./country-multi-select";
import { LEVELS, LEVEL_NAME } from "@/lib/level";
import { Agents } from "./_components/agents";
import { ResultCard } from "./_components/result-card";
import { SingleSelect } from "./_components/single-select";
import { Disclosure } from "./_components/agent-disclosure";

type SP = Promise<Record<string, string | string[] | undefined>>;
const COUNTRIES = Object.entries(COUNTRY_NAME).sort((a, b) => a[1].localeCompare(b[1]));
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <main className="page-container" id="main">
      <div className="home-intro">
        <h1>Can you actually apply to this job from where you are?</h1>
        <p>The <a className="text-link" href="https://speedrun-talent-network.com/jobs?source=speedrun-ultra">speedrun talent board</a>{" "}
        labels roles <em>remote</em>, but not <em>remote from where</em>, and it has no visa field. Those answers are usually sitting in the job description. This
        extracts them, with quotes, for every engineering and product role, and checks them against your profile.</p>
      </div>
      <Disclosure id="demo" className="demo-panel" defaultOpen title="Watch the 2-min demo" subtitle="What it does and why I built it.">
        <video className="demo-video" controls preload="none" playsInline poster="/demo-poster.jpg">
          <source src="/video/demo.mp4" type="video/mp4" />
        </video>
      </Disclosure>
      <Suspense fallback={<ProfileForm sp={{}} />}>
        <FormWithParams searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="agent-panel eyebrow">Loading agent connection…</div>}>
        <Agents searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="loading-state" role="status">loading index…</div>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function FormWithParams({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <ProfileForm key={JSON.stringify(sp)} sp={sp} />;
}

const LEVEL_OPTIONS = LEVELS.map((l) => [l, LEVEL_NAME[l]] as [string, string]);
const LEVEL_CHIPS: Record<string, string> = { intern: "intern", new_grad: "new grad", junior: "junior", mid: "mid", senior: "senior", staff: "staff", lead: "lead+" };

function ProfileForm({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const v = (k: string, d = "") => one(sp[k]) ?? d;
  return (
    <Form action="/" className="profile-panel" aria-labelledby="profile-title">
      <div className="profile-heading"><h2 id="profile-title" className="eyebrow">Your profile</h2><span>Profile stays in the URL. No account needed.</span></div>
      <div className="profile-grid">
        <SingleSelect name="country" label="I live in" defaultValue={v("country", "IN")} options={COUNTRIES} searchable />
        <div className="field">also can work in
          <CountryMultiSelect key={v("authorized_in")} name="authorized_in" options={COUNTRIES}
            defaultValue={v("authorized_in").split(",").map((c) => c.trim().toUpperCase()).filter((c) => c && COUNTRY_NAME[c])}
            className="field-input" />
        </div>
        <label className="field">years exp
          <input name="years" type="number" min={0} max={40} defaultValue={v("years", "3")} className="field-input" />
        </label>
        <SingleSelect name="show" label="show" defaultValue={v("show", "both")}
          options={[["both", "remote + office"], ["remote", "remote only"], ["office", "office only"]]} />
        <label className="field">min pay (USD/yr)
          <input name="min_salary" type="number" min={0} step={10000} placeholder="any" defaultValue={v("min_salary")} className="field-input" />
        </label>
        <SingleSelect name="function" label="function" defaultValue={v("function", "")}
          options={[["", "eng + product"], ["engineering", "engineering"], ["product", "product"]]} />
      </div>
      <div className="profile-search">
        <label className="field">keywords
          <input name="q" maxLength={120} placeholder="skills or company: mcp, rust, ios, stripe…" defaultValue={v("q")} className="field-input" />
        </label>
        <div className="field">level
          <CountryMultiSelect key={v("level")} name="level" options={LEVEL_OPTIONS} placeholder="all levels" hideCodes
            chipLabels={LEVEL_CHIPS} searchPlaceholder="filter levels…"
            defaultValue={v("level").split(",").map((x) => x.trim()).filter((x) => (LEVELS as readonly string[]).includes(x))}
            className="field-input" />
        </div>
        <button type="submit" className="button button-primary">Check eligibility <span aria-hidden="true">→</span></button>
      </div>
      <div className="profile-options">
        <label><input type="checkbox" name="open_to_relocation" value="true" defaultChecked={v("open_to_relocation") === "true"} /> include jobs in other countries if they sponsor a visa</label>
        <label><input type="checkbox" name="include_unclear" value="true" defaultChecked={v("include_unclear") === "true"} /> include unclear</label>
        <label><input type="checkbox" name="include_no_salary" value="true" defaultChecked={v("include_no_salary") === "true"} /> include roles with no posted pay</label>
      </div>
    </Form>
  );
}

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]).filter(([, v]) => v !== undefined && v !== ""));
  if (!raw.country) { raw.country = "IN"; raw.years ??= "3"; }
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return <p className="input-error">Invalid input: {parsed.error.issues.map((i) => i.path.join(".")).join(", ")}</p>;
  const profile = toProfile(parsed.data);
  if ("error" in profile) return <p className="input-error">{profile.error}</p>;
  const requested = Number(one(sp.n) ?? 20);
  const n = Number.isFinite(requested) ? Math.min(200, Math.max(20, Math.floor(requested / 20) * 20)) : 20;
  const opts = toSearchOpts(parsed.data, 20);
  const [pages, s] = await Promise.all([
    Promise.all(Array.from({ length: n / 20 }, (_, page) => search(profile, { ...opts, page, limit: 20 }))),
    stats(profile.country),
  ]);
  const r = pages[0];
  const hits = pages.flatMap((page) => page.hits);
  // keyword searches: also show matching roles that aren't open to this profile, with the reason
  const hidden = (["eligible", "unclear", "not_eligible"] as const).filter((v) => !opts.verdicts?.includes(v));
  const others = opts.q && hidden.some((v) => r.counts[v] > 0)
    ? (await search(profile, { ...opts, verdicts: [...hidden], page: 0, limit: 20 })) : null;
  const cname = COUNTRY_NAME[profile.country] ?? profile.country;
  const rf = s.remote_for;
  const expandHref = (count: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
      else if (value !== undefined) params.set(key, value);
    }
    params.set("n", String(count));
    return `/?${params}`;
  };

  return (
    <section id="results" className="results-section" aria-label="Job results">
      {opts.show !== "office" && <p className="headline-stat">
        Of <b>{s.remote}</b> remote roles on the board, <b className="text-eligible">{rf.eligible}</b> are clearly open to someone living in {cname}.{" "}
        <b className="text-ineligible">{rf.not_eligible}</b> rule {cname} out, and <b className="text-unclear">{rf.unclear}</b> don&apos;t say where.
      </p>}
      <p className="index-meta">{s.total} roles indexed · source fetched {s.fetchedAt?.slice(0, 16).replace("T", " ")} UTC</p>
      <div className="results-toolbar">
        <h2 className="eyebrow">your filters:</h2>
        <div className="filter-counts"><span className="text-eligible">{r.counts.eligible} eligible</span><span className="text-unclear">{r.counts.unclear} unclear</span><span className="text-ineligible">{r.counts.not_eligible} not eligible</span></div>
        <span className="results-showing">showing {hits.length ? 1 : 0}–{hits.length} of {r.total}</span>
      </div>
      {hits.length === 0 ? <p className="empty-state">{others?.total
        ? <>No role matching &ldquo;{opts.q}&rdquo; is open to you. Here&apos;s why the matching ones aren&apos;t.</>
        : "No roles match. Try including unclear roles, unticking remote only, or clearing keywords."}</p> : (
        <ol className="results-list">{hits.map((h) => <ResultCard key={h.job.id} h={hitOut(h)} />)}</ol>
      )}
      {(hits.length > 20 || (hits.length < r.total && n < 200)) && <div className="results-actions">
        {hits.length < r.total && n < 200 && <Link href={expandHref(n + 20)} scroll={false} className="button button-primary">Show more <span aria-hidden="true">↓</span></Link>}
        {hits.length > 20 && <Link href={expandHref(20)} scroll={false} className="button button-secondary">Collapse <span aria-hidden="true">↑</span></Link>}
        <span className="muted text-xs">{hits.length} of {r.total} roles</span>
      </div>}
      {others && others.total > 0 && <div className="other-matches">
        <h3 className="eyebrow">Also matching &ldquo;{opts.q}&rdquo;, not open to you ({others.total})</h3>
        <ol className="results-list">{others.hits.map((h) => <ResultCard key={h.job.id} h={hitOut(h)} />)}</ol>
        {others.total > others.hits.length && <p className="muted text-xs">Showing {others.hits.length} of {others.total}. Narrow the keywords to see the rest.</p>}
      </div>}
            <Link href="/health" className="health-teaser"><span><b>{s.health.hidden_restriction ?? 0}</b> roles say &ldquo;Remote&rdquo; but restrict the country in the JD</span><span>Data health →</span></Link>
    </section>
  );
}
