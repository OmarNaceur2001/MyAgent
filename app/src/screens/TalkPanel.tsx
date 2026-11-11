import { Check, Circle, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Features } from "../lib/events";
import { VoiceSettings } from "../components/VoiceSettings";
import { ResourceSettings } from "../components/ResourceSettings";
import { useMyAgent } from "../lib/store";

// "setup": built, but needs something installed/running on this PC.
// Without it, the feature isn't built yet ("Coming soon").
const SKILLS: { key: keyof Features; name: string; setup?: boolean }[] = [
  { key: "timer", name: "Timers and Pomodoro" },
  { key: "voice", name: "Hearing you (Whisper)", setup: true },
  { key: "wake", name: "“Hey MyAgent” wake word", setup: true },
  { key: "tts", name: "Talking back (Piper)", setup: true },
  { key: "llm", name: "Understanding requests (Ollama)", setup: true },
  { key: "computer", name: "Web search, websites, YouTube" },
  { key: "vision", name: "Seeing your screen" },
];

export function TalkPanel() {
  const chat = useMyAgent((s) => s.chat);
  const task = useMyAgent((s) => s.task);
  const features = useMyAgent((s) => s.features);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length]);

  return (
    <div className="panel-body">
      <header className="panel-head">
        <h2>Talk</h2>
        <p className="muted">What you asked, and what MyAgent did about it.</p>
      </header>

      {task && (
        <section className="task-card" aria-label="Current task">
          <h3>{task.goal}</h3>
          <ol className="steps">
            {task.steps.map((st) => (
              <li key={st.id} data-status={st.status}>
                <StepIcon status={st.status} />
                <span>
                  {st.title}
                  {st.note && <small className="muted">{st.note}</small>}
                </span>
              </li>
            ))}
          </ol>
          {task.result && <p className={task.result.ok ? "ok" : "bad"}>{task.result.summary}</p>}
        </section>
      )}

      <div className="chat" role="log">
        {chat.length === 0 ? (
          <p className="empty">Say “Hey MyAgent”, or type below. Your conversation shows up here.</p>
        ) : (
          chat.map((l) => (
            <p key={l.id} className={`line ${l.from}`}>
              {l.text}
            </p>
          ))
        )}
        <div ref={end} />
      </div>

      <VoiceSettings />
      <ResourceSettings />

      <section className="skills" aria-label="What MyAgent can do">
        <h3 className="sub">What MyAgent can do</h3>
        <ul>
          {SKILLS.map((s) => {
            const on = features?.[s.key] ?? false;
            return (
              <li key={s.key} data-on={on}>
                <span className="skill-dot" />
                {s.name}
                <span className="skill-state">{on ? "Ready" : s.setup ? "Not set up" : "Coming soon"}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "done") return <Check size={18} strokeWidth={3} />;
  if (status === "failed") return <X size={18} strokeWidth={3} />;
  if (status === "running") return <LoaderCircle size={18} strokeWidth={3} className="spin" />;
  return <Circle size={14} strokeWidth={3} />;
}
