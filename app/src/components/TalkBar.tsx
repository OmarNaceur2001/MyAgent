import { SendHorizontal, Square } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sayToMimo, send, useMimo } from "../lib/store";
import { MicButton } from "./MicButton";

// Type or talk to MIMO.
export function TalkBar({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState("");
  const connected = useMimo((s) => s.connected);
  const busy = useMimo((s) => ["thinking", "working", "waiting_confirmation"].includes(s.agentState));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (sayToMimo(text)) setText("");
  };

  return (
    <form className={`talkbar${compact ? " compact" : ""}`} onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={connected ? "Try “let's play tic-tac-toe”" : "Start the agent to talk to MIMO"}
        aria-label="Message MIMO"
      />
      {busy ? (
        <button type="button" className="icon-btn stop" aria-label="Stop MIMO" title="Stop" onClick={() => send("agent.cancel")}>
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
