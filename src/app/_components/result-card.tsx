import type { hitOut } from "@/lib/format";
import { LEVEL_NAME } from "@/lib/level";

const MARK: Record<string, string> = { pass: "✓", fail: "✕", unknown: "?" };

export function ResultCard({ h }: { h: ReturnType<typeof hitOut> }) {
  const facts = Object.entries(h.facts);
  return (
    <li className="job-card">
      <div className="job-header">
        <div className="min-w-0">
          <a href={h.url} className="job-title" target="_blank" rel="noreferrer">{h.title}<span className="job-company"> · {h.company}</span><span className="job-outbound" aria-hidden="true"> ↗</span></a>
          <div className="job-meta">{[h.level ? LEVEL_NAME[h.level] : null, h.location ?? "no location", h.workplace ?? "workplace not set", h.posted].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="job-summary">
          {h.pay ? (
            <span className="job-pay" title={h.pay.from === "board" ? "posted on the board" : "found in the job description"}>
              {h.pay.text}{h.pay.from !== "board" && <span className="muted"> · JD</span>}
            </span>
          ) : <span className="job-pay muted">pay not posted</span>}
          <span className={`verdict verdict-${h.verdict}`}>{h.verdict.replace("_", " ")}</span>
        </div>
      </div>
      <ul className="job-reasons">
        {h.reasons.map((r, i) => (
          <li key={i} className="reason">
            <span className={`status-mark status-${r.status}`}>{MARK[r.status]}</span>
            <div className="min-w-0">
              <span>{r.reason}</span>
              {r.quotes.slice(0, 1).map((q, k) => <blockquote key={k}>“{q}”</blockquote>)}
            </div>
          </li>
        ))}
        {h.reasons.length === 0 && <li className="muted">No restrictions found.</li>}
      </ul>
      {facts.length > 0 && <div className="fact-chips">{facts.map(([k, v]) => <span key={k}>{k.replace(/_/g, " ")}: {String(v)}</span>)}</div>}
    </li>
  );
}
