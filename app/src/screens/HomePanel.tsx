import { Coffee, Sparkles, Timer as TimerIcon } from "lucide-react";
import { sayToMyAgent, send, useMyAgent } from "../lib/store";

const TRY_SAYING = [
  "Hey MyAgent!",
  "Let's play tic-tac-toe",
  "Play some lofi hip hop",
  "Tell me a joke",
  "Start a 25-minute Pomodoro",
];

function greeting(hour: number) {
  if (hour < 5) return "Up late?";
  if (hour < 12) return "Good morning!";
  if (hour < 18) return "Good afternoon!";
  return "Good evening!";
}

export function HomePanel({ onFocus }: { onFocus: () => void }) {
  const stats = useMyAgent((s) => s.stats);
  const connected = useMyAgent((s) => s.connected);
  const timer = useMyAgent((s) => s.timer);

  return (
    <div className="panel-body">
      <header className="panel-head">
        <h2>{greeting(new Date().getHours())}</h2>
        <p className="muted">What are we doing today?</p>
      </header>

      {!connected && (
        <div className="notice" role="alert">
          <strong>MyAgent's agent isn't running.</strong>
          <span>
            Open a terminal in <code>agent</code> and run <code>python run.py</code>. MyAgent wakes up as soon as it's
            on.
          </span>
        </div>
      )}

      <dl className="today">
        <div>
          <dt>Focused today</dt>
          <dd>
            {stats.focus_minutes_today}
            <small>min</small>
          </dd>
        </div>
        <div>
          <dt>Sessions</dt>
          <dd>{stats.sessions_today}</dd>
        </div>
        <div className="coins">
          <dt>Coins</dt>
          <dd>{stats.coins}</dd>
        </div>
      </dl>

      <div className="actions">
        <button
          className="btn-primary"
          disabled={!connected}
          onClick={() => {
            if (!timer) send("pomodoro.start", {});
            onFocus();
          }}
        >
          <TimerIcon size={22} strokeWidth={2.5} />
          {timer ? "See my timer" : "Start focusing"}
        </button>
        <button className="btn-secondary" disabled={!connected} onClick={() => send("timer.start", { minutes: 5, label: "Break" })}>
          <Coffee size={22} strokeWidth={2.5} />
          Take a 5-minute break
        </button>
      </div>

      <h3 className="sub">
        <Sparkles size={16} strokeWidth={2.5} /> Try saying
      </h3>
      <ul className="try-list">
        {TRY_SAYING.map((t) => (
          <li key={t}>
            <button className="chip" disabled={!connected} onClick={() => sayToMyAgent(t)}>
              {t}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
