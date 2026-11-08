// Sentence segmentation + snippet selection for JDs.

const ABBREV = /\b(U\.S\.A\.|U\.S\.|U\.K\.|e\.g\.|i\.e\.|etc\.|Inc\.|Ltd\.|Corp\.|Co\.|Jr\.|Sr\.|St\.|vs\.|approx\.|No\.|D\.C\.|N\.A\.)/g;
const DOT = "\u2024"; // one-dot leader as placeholder

const ENTITIES: Record<string, string> = { mdash: "—", ndash: "–", amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "…" };

export function normalize(s: string): string {
  return s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m)).replace(/\u00a0/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[ \t]+/g, " ");
}

/** Split a JD into sentences/lines, keeping each as a verbatim (normalised) substring. */
export function sentences(text: string): string[] {
  const t = normalize(text).replace(ABBREV, (m) => m.replace(/\./g, DOT));
  const out: string[] = [];
  for (const line of t.split(/\n+/)) {
    for (const s of line.split(/(?<=[.!?;])\s+(?=[A-Z0-9"'(\-•*])/)) {
      const v = s.replace(new RegExp(DOT, "g"), ".").replace(/^[\s\-•*·–]+/, "").trim();
      if (v.length > 1) out.push(v);
    }
  }
  return out;
}

/** Words that signal eligibility-relevant content. */
export const TRIGGER =
  /\b(remote|anywhere|based (in|out of)|located|location|reside|residen\w*|live in|living in|relocat\w*|sponsor\w*|visa|h-?1b|o-?1|opt\b|cpt\b|green card|immigration|authori[sz]ed to work|work authori[sz]ation|right to work|eligible to work|citizen\w*|u\.?s\.? persons?|itar|ear\b|export control|clearance|time ?zones?|overlap|hours|pst|pdt|est|edt|cet|gmt|utc|ist\b|pacific|eastern|central time|in[- ]office|in[- ]person|on-?site|hybrid|days (a|per|each) week|per week|commut\w*|years?|yrs|new grad|entry[- ]level|salary|compensation|pay range|base pay|\$\s?\d|£\s?\d|€\s?\d|usd|eur\b|gbp|countries|country|region|emea|apac|latam|europe|north america|americas|international|global|worldwide|eor|deel|contractor)\b/i;

/** Boilerplate that is mostly noise for eligibility (EEO etc.). */
const NOISE = /(equal (employment )?opportunity|without regard to|regardless of (race|age)|protected (veteran|characteristic)|reasonable accommodation|e-verify|know your rights|pay transparency (law|act)|arrest (and|or) conviction|fair chance)/i;

export type Snippet = { i: number; text: string };

/** Sentences containing a trigger, plus one sentence of context on either side. Capped. */
export function snippets(text: string, maxChars = 3500): Snippet[] {
  const ss = sentences(text);
  const keep = new Set<number>();
  ss.forEach((s, i) => {
    if (TRIGGER.test(s) && !NOISE.test(s)) {
      keep.add(i);
      // headings like "Location:" carry meaning onto the next line
      if (/:\s*$/.test(s) && i + 1 < ss.length) keep.add(i + 1);
      if (i > 0 && /:\s*$/.test(ss[i - 1])) keep.add(i - 1);
    }
  });
  const out: Snippet[] = [];
  let used = 0;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const s = ss[i].length > 400 ? ss[i].slice(0, 400) + "…" : ss[i];
    if (used + s.length > maxChars) break;
    out.push({ i, text: s });
    used += s.length;
  }
  return out;
}

/** Whitespace/quote-insensitive containment check used to verify LLM quotes. */
export function quoteInText(quote: string, text: string): boolean {
  const n = (s: string) => normalize(s).toLowerCase().replace(/[\s\u2026.…,;:()\-–—"'*•]+/g, " ").trim();
  const q = n(quote);
  return q.length >= 4 && n(text).includes(q);
}
