"use client";

import { useId, useState } from "react";
import { CopyButton } from "./copy-button";

export function AgentPrompt({ initialPrompt }: { initialPrompt: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const id = useId();

  return (
    <div className="agent-prompt">
      <div className="agent-step-heading">
        <label htmlFor={id} className="eyebrow">02 · Try a prompt</label>
        <CopyButton text={prompt} label="Copy prompt" />
      </div>
      <textarea id={id} className="agent-prompt-input" rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-describedby={`${id}-hint`} spellCheck={false} />
      <p id={`${id}-hint`} className="agent-hint">Based on your submitted profile. Edit, copy, then paste into your agent. Works with or without the connector.</p>
    </div>
  );
}
