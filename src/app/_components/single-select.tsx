"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type Props = {
  name: string;
  label: string;
  options: [string, string][];
  defaultValue: string;
  searchable?: boolean;
};

/** Custom single-choice picker; still submits the original field through a GET form. */
export function SingleSelect({ name, label, options, defaultValue, searchable = false }: Props) {
  const initial = options.find(([value]) => value === defaultValue)?.[0] ?? options[0]?.[0] ?? "";
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(initial);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const selectedLabel = options.find(([key]) => key === value)?.[1] ?? "";
  const filter = (text: string) => {
    const q = text.trim().toLowerCase();
    return options.filter(([key, text]) => !q || text.toLowerCase().includes(q) || key.toLowerCase() === q);
  };
  const shown = filter(query);
  const activeIndex = Math.max(0, shown.findIndex(([key]) => key === active));
  const activeId = open && shown.length ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (!open) return;
    if (searchable) search.current?.focus();
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, searchable]);

  useEffect(() => {
    if (open) list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, query]);

  function openMenu() {
    setQuery("");
    setActive(value);
    setOpen(true);
  }

  function choose(next: string) {
    setValue(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else if (shown.length) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActive(shown[(activeIndex + direction + shown.length) % shown.length][0]);
      }
    } else if (open && (event.key === "Enter" || (!searchable && event.key === " "))) {
      event.preventDefault();
      if (shown.length) choose(shown[activeIndex][0]);
    } else if (!searchable && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      if (!open) openMenu();
      setActive(options[event.key === "Home" ? 0 : options.length - 1]?.[0] ?? value);
    } else if (!searchable && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!open) openMenu();
      const text = (event.timeStamp - typeahead.current.at < 700 ? typeahead.current.text : "") + event.key.toLowerCase();
      typeahead.current = { text, at: event.timeStamp };
      const match = options.find(([, label]) => label.toLowerCase().startsWith(text)) ?? options.find(([, label]) => label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match) setActive(match[0]);
    }
  }

  return (
    <div className="field">
      <label id={labelId} htmlFor={`${id}-trigger`}>{label}</label>
      <div ref={root} className="single-select-root" onKeyDown={onKeyDown}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <input type="hidden" name={name} value={value} />
        <button ref={trigger} id={`${id}-trigger`} type="button" className="field-input single-select-trigger"
          role={searchable ? undefined : "combobox"} aria-haspopup={searchable ? "dialog" : "listbox"}
          aria-expanded={open} aria-controls={open ? (searchable ? `${id}-popup` : listId) : undefined}
          aria-labelledby={`${labelId} ${id}-value`} aria-activedescendant={searchable ? undefined : activeId}
          onClick={() => { if (open) setOpen(false); else openMenu(); }}>
          <span id={`${id}-value`}>{selectedLabel}</span><span className="country-chevron" aria-hidden="true">▾</span>
        </button>
        {open && <div id={`${id}-popup`} className={`single-select-menu${searchable ? " is-searchable" : ""}`}
          role={searchable ? "dialog" : undefined} aria-labelledby={searchable ? labelId : undefined}>
          {searchable && <div className="country-menu-search">
            <input ref={search} role="combobox" aria-label="Search countries" aria-autocomplete="list" aria-expanded={open}
              aria-controls={listId} aria-activedescendant={activeId} placeholder="search countries…" value={query} autoComplete="off" autoCapitalize="none" autoCorrect="off"
              onChange={(event) => { setQuery(event.target.value); setActive(filter(event.target.value)[0]?.[0] ?? ""); }} />
          </div>}
          <ul ref={list} id={listId} role="listbox" tabIndex={-1} aria-labelledby={labelId} className="single-select-list">
            {shown.map(([key, text], index) => <li key={key} id={`${id}-option-${index}`} role="option" aria-selected={key === value}
              className={index === activeIndex ? "is-active" : undefined} onPointerMove={() => setActive(key)}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(key)}>
              <span className="single-select-check" aria-hidden="true">{key === value ? "✓" : ""}</span>
              <span>{text}</span>{searchable && <span className="single-select-code">{key}</span>}
            </li>)}
          </ul>
          {shown.length === 0 && <p className="single-select-empty" role="status">No countries found.</p>}
        </div>}
      </div>
    </div>
  );
}
