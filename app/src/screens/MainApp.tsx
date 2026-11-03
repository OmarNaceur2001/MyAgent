import { Gamepad2, House, MessageCircle, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelBoundary } from "../components/PanelBoundary";
import { Stage } from "../components/Stage";
import { hush, useMyAgent } from "../lib/store";
import { FocusPanel } from "./FocusPanel";
import { HomePanel } from "./HomePanel";
import { PlayPanel } from "./PlayPanel";
import { TalkPanel } from "./TalkPanel";

type Tab = "home" | "talk" | "play" | "focus";

const TABS: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "talk", label: "Talk", Icon: MessageCircle },
  { id: "play", label: "Play", Icon: Gamepad2 },
  { id: "focus", label: "Focus", Icon: Timer },
];

export function MainApp() {
  const [tab, setTab] = useState<Tab>("home");
  const connected = useMyAgent((s) => s.connected);
  const coins = useMyAgent((s) => s.stats.coins);
  const timerRunning = useMyAgent((s) => s.timer?.status === "running");
  const taskId = useMyAgent((s) => s.task?.id);
  // When MyAgent starts a computer task, show its steps.
  useEffect(() => {
    if (taskId) setTab("talk");
  }, [taskId]);
  // Esc: stop whatever MyAgent is doing (talking, listening, a task)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) hush();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const game = useMyAgent((s) => s.game);
  useEffect(() => {
    if (game) setTab("play");
  }, [game]);

  return (
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <div className="wordmark" aria-label="MyAgent">
          <span className="wordmark-dot" data-on={connected} />
          MyAgent
        </div>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="rail-item"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={24} strokeWidth={2.5} />
            <span>{label}</span>
            {id === "focus" && timerRunning && <span className="rail-badge" aria-label="Timer running" />}
          </button>
        ))}
        <div className="rail-coins" title="Coins: earned by finishing focus sessions">
          <span className="coin" aria-hidden />
          {coins}
        </div>
      </nav>

      <Stage />

      <aside className="panel">
        <PanelBoundary key={tab}>
          {tab === "home" && <HomePanel onFocus={() => setTab("focus")} />}
          {tab === "talk" && <TalkPanel />}
          {tab === "play" && <PlayPanel />}
          {tab === "focus" && <FocusPanel />}
        </PanelBoundary>
      </aside>
    </div>
  );
}
