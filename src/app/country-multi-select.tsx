"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type Props = {
  name: string;
  /** [code, display name], sorted */
  options: [string, string][];
  defaultValue?: string[];
  placeholder?: string;
  /** chip text per value (defaults to the value itself, e.g. ISO codes) */
  chipLabels?: Record<string, string>;
  /** hide the code column in the list (for non-country options) */
  hideCodes?: boolean;
  searchPlaceholder?: string;
  className?: string;
};

const MAX_CHIPS = 2;

/** Submits one comma-joined ISO2 value, just like a plain GET form field. */
export function CountryMultiSelect({ name, options, defaultValue = [], placeholder = "none", className = "", chipLabels, hideCodes = false, searchPlaceholder = "search countries…" }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = useMemo(() => Object.fromEntries(options), [options]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (code: string) => setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter(([c, n]) => n.toLowerCase().includes(q) || c.toLowerCase() === q) : options;
  const shown = [...selected.map((c) => matches.find((m) => m[0] === c)).filter((m): m is [string, string] => !!m), ...matches.filter(([c]) => !selected.includes(c))];

  return (
    <div ref={root} className="country-root" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <input type="hidden" name={name} value={selected.join(",")} />
      <div className={`country-control ${className}`}>
        {selected.slice(0, MAX_CHIPS).map((c) => <span key={c} className="country-chip">
          {chipLabels?.[c] ?? c}<button type="button" aria-label={`Remove ${label[c] ?? c}`} onClick={() => toggle(c)}>×</button>
        </span>)}
        <button ref={trigger} type="button" className="country-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
          aria-label={`Also can work in: ${selected.length ? selected.map((c) => label[c] ?? c).join(", ") : "none"}`}
          onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}>
          {selected.length === 0 && <span className="country-placeholder">{placeholder}</span>}
          {selected.length > MAX_CHIPS && <span className="country-chip country-count" title={selected.slice(MAX_CHIPS).map((c) => label[c] ?? c).join(", ")}>+{selected.length - MAX_CHIPS}</span>}
          <span className="country-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
      {open && <div id={id} role="dialog" aria-label="Other countries you can work in" className="country-menu">
        <div className="country-menu-search">
          <input ref={search} value={query} aria-label="Search countries" onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (shown.length === 1) toggle(shown[0][0]); } }} placeholder={searchPlaceholder} />
          {selected.length > 0 && <button type="button" onClick={() => setSelected([])}>clear</button>}
        </div>
        <ul className="country-list">
          {shown.map(([code, n]) => <li key={code}><label>
            <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} />
            <span>{n}</span>{!hideCodes && <span>{code}</span>}
          </label></li>)}
          {shown.length === 0 && <li className="px-3 py-2 muted">no match</li>}
        </ul>
      </div>}
    </div>
  );
}
