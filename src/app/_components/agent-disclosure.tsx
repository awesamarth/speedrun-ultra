"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Collapsible "Use it from your agent" panel: chevron right when closed, up when open; height + chevron animate. */
export function AgentDisclosure({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // deep link: /#agents opens the panel
    const sync = () => { if (window.location.hash === "#agents") setOpen(true); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <section id="agents" className="agent-panel" data-open={open || undefined}>
      <h2 className="agent-title">
        <button type="button" className="agent-heading" aria-expanded={open} aria-controls="agents-body" onClick={() => setOpen((o) => !o)}>
          <span className="agent-heading-text">{title}<span>{subtitle}</span></span>
          <span className="agent-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div id="agents-body" className="agent-collapse" inert={!open}>
        <div className="agent-collapse-inner">{children}</div>
      </div>
    </section>
  );
}
