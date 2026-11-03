import { Pause, Play, SkipForward, Square } from "lucide-react";
import { formatClock, useSecondsLeft } from "../components/time";
import { send, useMyAgent } from "../lib/store";

const PRESETS = [
  { name: "Classic", focus: 25, short: 5, long: 15 },
  { name: "Deep work", focus: 50, short: 10, long: 20 },
];
const QUICK_TIMERS = [5, 10, 15];

export function FocusPanel() {
  const timer = useMyAgent((s) => s.timer);
  const connected = useMyAgent((s) => s.connected);
  const left = useSecondsLeft();

  if (!timer) {
    return (
      <div className="panel-body">
        <header className="panel-head">
          <h2>Focus</h2>
          <p className="muted">MyAgent puts its glasses on and keeps you company while you work.</p>
        </header>
        <div className="preset-list">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="preset"
              disabled={!connected}
              onClick={() => send("pomodoro.start", { focus_min: p.focus, short_min: p.short, long_min: p.long })}
            >
              <span className="preset-time">{p.focus}</span>
              <span>
                <strong>{p.name}</strong>
                <span className="muted">
                  {p.focus} min focus, {p.short} min breaks
                </span>
              </span>
              <Play size={20} strokeWidth={2.5} className="preset-go" />
            </button>
          ))}
        </div>
        <h3 className="sub">Just a timer</h3>
        <div className="quick-row">
          {QUICK_TIMERS.map((m) => (
            <button key={m} className="chip" disabled={!connected} onClick={() => send("timer.start", { minutes: m })}>
              {m} min
            </button>
          ))}
        </div>
      </div>
    );
  }

  const progress = timer.duration_s ? 1 - left / timer.duration_s : 0;
  const isPomodoro = timer.cycles_before_long > 0;
  const paused = timer.status === "paused";

  return (
    <div className="panel-body focus-live" data-kind={timer.kind}>
      <header className="panel-head">
        <h2>{timer.label}</h2>
        <p className="muted">
          {timer.kind === "focus" && "Heads down. MyAgent is right here."}
          {timer.kind === "short_break" && "Stretch, drink some water."}
          {timer.kind === "long_break" && "Proper break. Step away from the screen."}
          {timer.kind === "timer" && "Counting down."}
        </p>
      </header>

      <Ring progress={progress} paused={paused}>
        <span className="ring-time">{formatClock(left)}</span>
        {paused && <span className="ring-note">Paused</span>}
      </Ring>

      {isPomodoro && (
        <div className="cycles" aria-label={`Session ${timer.cycle} of ${timer.cycles_before_long}`}>
          {Array.from({ length: timer.cycles_before_long }, (_, i) => {
            const n = i + 1;
            const done = n < timer.cycle || (n === timer.cycle && timer.kind !== "focus");
            const now = n === timer.cycle && timer.kind === "focus";
            return <span key={n} className={`cycle${done ? " done" : ""}${now ? " now" : ""}`} />;
          })}
        </div>
      )}

      {isPomodoro && (
        <p className="next-up muted">
          Session {timer.cycle} of {timer.cycles_before_long} ·{" "}
          {timer.kind === "focus"
            ? `next: ${timer.cycle % timer.cycles_before_long === 0 ? "long" : "short"} break`
            : "next: focus"}
        </p>
      )}

      <div className="controls">
        {paused ? (
          <button className="btn-primary" onClick={() => send("timer.resume")}>
            <Play size={20} strokeWidth={2.5} /> Resume
          </button>
        ) : (
          <button className="btn-primary" onClick={() => send("timer.pause")}>
            <Pause size={20} strokeWidth={2.5} /> Pause
          </button>
        )}
        {isPomodoro && (
          <button className="icon-btn soft" onClick={() => send("timer.skip")} aria-label="Skip to next part" title="Skip">
            <SkipForward size={20} strokeWidth={2.5} />
          </button>
        )}
        <button className="icon-btn soft" onClick={() => send("timer.stop")} aria-label="Stop" title="Stop">
          <Square size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function Ring({ progress, paused, children }: { progress: number; paused: boolean; children: React.ReactNode }) {
  const r = 104;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" data-paused={paused}>
      <svg viewBox="0 0 240 240" aria-hidden>
        <circle cx="120" cy="120" r={r} className="ring-track" />
        <circle
          cx="120"
          cy="120"
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
