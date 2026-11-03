import { SendHorizontal, Square } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sayToMyAgent, send, useMyAgent } from "../lib/store";
import { MicButton } from "./MicButton";

// Type or talk to MyAgent.
export function TalkBar({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState("");
  const connected = useMyAgent((s) => s.connected);
  const busy = useMyAgent((s) => ["thinking", "working", "waiting_confirmation"].includes(s.agentState));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (sayToMyAgent(text)) setText("");
  };

  return (
    <form className={`talkbar${compact ? " compact" : ""}`} onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={connected ? "Try “let's play tic-tac-toe”" : "Start the agent to talk to MyAgent"}
        aria-label="Message MyAgent"
      />
      {busy ? (
        <button type="button" className="icon-btn stop" aria-label="Stop MyAgent" title="Stop" onClick={() => send("agent.cancel")}>
          <Square size={18} strokeWidth={2.5} />
        </button>
      ) : (
        <button type="submit" className="icon-btn" aria-label="Send" disabled={!text.trim()}>
          <SendHorizontal size={20} strokeWidth={2.5} />
        </button>
      )}
      <MicButton />
    </form>
  );
}
