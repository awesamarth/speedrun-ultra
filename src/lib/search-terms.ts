// Shared tokenizer for keyword search (build-time JD index and request-time queries must agree).

/** lowercase words; keeps tech tokens like c++, c#, node.js; trims sentence dots; drops pure numbers */
export function searchTokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const t = raw.replace(/^\.+|\.+$/g, "");
    if (t.length > 1 && t.length <= 30 && !/^\d+$/.test(t)) out.push(t);
  }
  return out;
}
