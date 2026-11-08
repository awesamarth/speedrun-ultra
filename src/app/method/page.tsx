import type { Metadata } from "next";
import accuracy from "@/data/accuracy.json";

export const metadata: Metadata = { title: "Method and accuracy · speedrun-ultra" };

type Acc = {
  n: number;
  fields: { field: string; support: number; precision: number | null; recall: number | null }[];
  verdict?: { eligible_precision: number | null; eligible_recall: number | null; false_eligible: number; eligible_verdicts: number; profiles: string[] };
};

export default function MethodPage() {
  const a = accuracy as Acc;
  return (
    <main id="main" className="page-container document-page">
      <div className="page-heading"><p className="eyebrow">Evidence, not assumptions</p><h1>Method and accuracy</h1></div>
      <ol className="method-steps">
        <li>Pull every engineering and product role, with its full JD, from the board&apos;s public API (throttled and cached; refreshed incrementally).</li>
        <li>Regex and heuristics extract countries, visa, legal requirements, years, timezone, onsite days and pay. An LLM reads the eligibility-relevant sentences of every JD with a strict JSON schema.</li>
        <li>Every LLM quote must appear verbatim in the JD or it&apos;s dropped. When regex and LLM disagree, the field is marked conflicting and can never make a role “eligible”.</li>
        <li>Verdict: <b>eligible</b> only when each check has evidence. <b>Unclear</b> means the posting doesn&apos;t say. It is not a yes.</li>
      </ol>
      {a.n > 0 ? <section className="accuracy-section" aria-labelledby="accuracy-title">
        <h2 id="accuracy-title" className="eyebrow">Accuracy</h2>
        {a.verdict && <p className="accuracy-callout">
          <b>{a.verdict.false_eligible}</b> false “eligible” verdicts out of <b>{a.verdict.eligible_verdicts}</b> on {a.n} checked JDs × {a.verdict.profiles.length} profiles
          ({a.verdict.profiles.join("; ")}). It found {Math.round((a.verdict.eligible_recall ?? 0) * 100)}% of truly eligible pairs; the rest show as unclear.
        </p>}
        <p className="accuracy-note">Per field: precision = when a value is extracted, how often it&apos;s right. Recall = how often a value stated in the JD is found.</p>
        <div className="table-panel">
          <table className="data-table accuracy-table">
            <caption className="sr-only">Per-field extraction accuracy</caption>
            <thead><tr><th scope="col">field</th><th scope="col" className="numeric">stated in</th><th scope="col" className="numeric">precision</th><th scope="col" className="numeric">recall</th></tr></thead>
            <tbody>{a.fields.map((f) => <tr key={f.field}>
              <th scope="row"><code>{f.field}</code></th><td className="numeric">{f.support}</td>
              <td className="numeric">{f.precision == null ? "–" : `${Math.round(f.precision * 100)}%`}</td>
              <td className="numeric">{f.recall == null ? "–" : `${Math.round(f.recall * 100)}%`}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section> : <p className="loading-state">Accuracy evaluation pending.</p>}
    </main>
  );
}
