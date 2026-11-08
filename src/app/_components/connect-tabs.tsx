"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CopyButton } from "./copy-button";

type Tab = { id: string; label: string; body: ReactNode };

function Snippet({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <div className="agent-command">
      <code>{text}</code>
      <CopyButton text={text} label={label} />
    </div>
  );
}

/** Per-client setup instructions for the remote MCP server, plus the no-install path. */
export function ConnectTabs({ url, origin }: { url: string; origin: string }) {
  const name = "speedrun-ultra";
  const tabs: Tab[] = [
    {
      id: "none",
      label: "No install",
      body: (
        <>
          <p className="agent-client">
            Nothing to set up. Copy the prompt and paste it into any agent that can browse the web (ChatGPT, Claude, Cursor…). It reads{" "}
            <a href="/llms.txt">{origin.replace(/^https?:\/\//, "")}/llms.txt</a> and calls the JSON API.
          </p>
          <p className="agent-hint">Connect the MCP server instead if you&apos;ll use it often: the agent gets typed tools and skips the reading step.</p>
        </>
      ),
    },
    {
      id: "claude",
      label: "Claude",
      body: (
        <ol className="agent-steps">
          <li>Claude.ai or Claude Desktop: <b>Settings → Connectors → Add custom connector</b>.</li>
          <li>Name it <b>{name}</b> and paste the MCP URL above. No authentication.</li>
          <li>Enable it in a chat from the tools menu, then paste the prompt.</li>
        </ol>
      ),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      body: (
        <>
          <p className="agent-client">Run once in your terminal:</p>
          <Snippet text={`claude mcp add --transport http ${name} ${url}`} label="Copy command" />
        </>
      ),
    },
    {
      id: "cursor",
      label: "Cursor",
      body: (
        <>
          <p className="agent-client">Add to <b>~/.cursor/mcp.json</b> (all projects) or <b>.cursor/mcp.json</b> (this project):</p>
          <Snippet text={JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2)} label="Copy JSON" />
        </>
      ),
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      body: (
        <ol className="agent-steps">
          <li>On the web, open <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">chatgpt.com/plugins</a> → <b>+</b> → <b>Add custom MCP server</b>.</li>
          <li>Name it <b>{name}</b>, paste the MCP URL as the <b>Server URL</b>, choose <b>No authentication</b>.</li>
          <li>Accept the warning, <b>Create as a plugin</b>, install it, then type <b>@{name}</b> in a chat.</li>
        </ol>
      ),
    },
    {
      id: "codex",
      label: "Codex",
      body: (
        <>
          <p className="agent-client">Run once (CLI, IDE extension and desktop app share the config):</p>
          <Snippet text={`codex mcp add ${name} --url ${url}`} label="Copy command" />
        </>
      ),
    },
  ];

  const [active, setActive] = useState(tabs[0].id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : null;
    if (next == null) return;
    e.preventDefault();
    setActive(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="agent-tabs">
      <div role="tablist" aria-label="Choose your agent" className="agent-tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className="agent-tab"
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={active !== t.id}
          className="agent-tabpanel"
        >
          {t.body}
        </div>
      ))}
    </div>
  );
}
