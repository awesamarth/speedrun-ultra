"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({ text, label = "Copy", ariaLabel = label }: { text: string; label?: string; ariaLabel?: string }) {
  const [feedback, setFeedback] = useState<{ text: string; label: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ text, label: "Copied" });
    } catch {
      setFeedback({ text, label: "Copy failed" });
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 2500);
  }

  return <button type="button" className="copy-button" onClick={copy} aria-label={ariaLabel} disabled={!text.trim()}><span aria-live="polite">{feedback?.text === text ? feedback.label : label}</span></button>;
}
