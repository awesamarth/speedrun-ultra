import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { stats } from "@/lib/store";

export const metadata: Metadata = { title: "Data health · speedrun-ultra" };

export default function HealthPage() {
  return (
    <main id="main" className="page-container document-page">
      <div className="page-heading"><p className="eyebrow">The index</p><h1>Data health</h1></div>
      <Suspense fallback={<p className="loading-state" role="status">loading index…</p>}><Health /></Suspense>
    </main>
  );
}

async function Health() {
  await connection(); // live D1 data: render per request, never at build time
  const s = await stats("IN");
  const rows: [string, number, string][] = [
    ["missing_workplace", s.health.missing_workplace ?? 0, "no onsite/hybrid/remote label at all"],
    ["hidden_restriction", s.health.hidden_restriction ?? 0, "location just says “Remote”, but the JD restricts the country"],
    ["remote_label_jd_office", s.health.remote_label_jd_office ?? 0, "labelled remote, but the JD requires an office"],
    ["remote_conflict", s.health.remote_conflict ?? 0, "remote flag disagrees with the workplace label"],
    ["min_exp_in_text_only", s.health.min_exp_in_text_only ?? 0, "no min_experience label, but the JD states years"],
    ["pay_in_text_only", s.health.pay_in_text_only ?? 0, "no comp fields, but the JD states pay (invisible to the board's pay filter)"],
    ["function_mismatch", s.health.function_mismatch ?? 0, "top-level function ≠ labels.function"],
    ["duplicate", s.health.duplicate ?? 0, "same company + title + location listed more than once"],
    ["missing_location", s.health.missing_location ?? 0, "location is null"],
  ];
  const v = s.visa;
  return (
    <section aria-label="Index data health">
      <p className="document-intro">The board&apos;s labels are mostly right. They&apos;re just incomplete for the first question a candidate asks. Visa sponsorship is stated in only{" "}
        {v.yes + v.no} of {s.total} JDs ({v.no} won&apos;t sponsor, {v.yes} will), and there is no field for it.
      </p>
      <div className="health-summary">
        <div><span className="eyebrow">Roles indexed</span><strong>{s.total}</strong></div>
        <div><span className="eyebrow">Will sponsor</span><strong>{v.yes}</strong></div>
        <div><span className="eyebrow">Won&apos;t sponsor</span><strong>{v.no}</strong></div>
      </div>
      <div className="table-panel health-table-panel">
        <table className="data-table health-table">
          <caption>Data health ({s.total} roles)</caption>
          <thead><tr><th scope="col">Field</th><th scope="col" className="numeric">Roles</th><th scope="col">What the data shows</th></tr></thead>
          <tbody>{rows.map(([k, n, d]) => <tr key={k}>
            <th scope="row"><code>{k}</code></th>
            <td className="numeric">{n}</td>
            <td>{d}{(s.examples[k] ?? []).length > 0 && <span className="health-examples">e.g.{" "}
              {(s.examples[k] ?? []).map((e, i) => <span key={e.url}>{i > 0 && ", "}<a href={e.url}>{e.company}: {e.title}</a>{e.location ? ` (${e.location})` : ""}</span>)}
            </span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
