"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = { id: string; title: string; subtitle: string; defaultOpen?: boolean; className?: string; children: ReactNode };

/** Collapsible panel: chevron right when closed, down when open; height + chevron animate. /#id opens it. */
export function Disclosure({ id, title, subtitle, defaultOpen = false, className = "", children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const sync = () => { if (window.location.hash === `#${id}`) setOpen(true); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);

  return (
    <section id={id} className={`agent-panel ${className}`} data-open={open || undefined}>
      <h2 className="agent-title">
        <button type="button" className="agent-heading" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)}>
          <span className="agent-heading-text">{title}<span>{subtitle}</span></span>
          <span className="agent-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div id={`${id}-body`} className="agent-collapse" inert={!open}>
        <div className="agent-collapse-inner">{children}</div>
      </div>
    </section>
  );
}

export function AgentDisclosure(p: Omit<Props, "id">) {
  return <Disclosure id="agents" {...p} />;
}
