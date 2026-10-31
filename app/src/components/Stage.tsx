import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MOOD_LABEL } from "../character";
import { useMimo, useMood } from "../lib/store";
import { GameStage } from "../games/GameStage";
import { ConfirmCard } from "./ConfirmCard";
import { LiveMimo } from "./LiveMimo";
import { PALETTE, Room, type Scene } from "./Room";
import { TalkBar } from "./TalkBar";
import { formatClock, useSecondsLeft } from "./time";

// Bubbles stay long enough to read: ~60 ms per character, between 4 and 12 s.
const bubbleMs = (text: string) => Math.min(12000, Math.max(4000, text.length * 60));

// The heart of the main window: MIMO in its room, what it's saying,
// and the bar to talk to it.
export function Stage() {
  const mood = useMood();
  const timer = useMimo((s) => s.timer);
  const bubble = useMimo((s) => s.bubble);
  const connected = useMimo((s) => s.connected);
  const inGame = useMimo((s) => s.game !== null);
  const wakeOn = useMimo((s) => !!s.features?.wake && !!s.prefs?.wake_word);
  const idle = useMimo((s) => s.agentState === "idle");
  const left = useSecondsLeft();
  const [shownBubble, setShownBubble] = useState<string | null>(null);

  useEffect(() => {
    if (!bubble) return;
    setShownBubble(bubble.text);
    const t = setTimeout(() => setShownBubble(null), bubbleMs(bubble.text));
    return () => clearTimeout(t);
  }, [bubble]);

  const now = useMimo((s) => s.now);
  const d = new Date(now);
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const scene: Scene =
    timer?.kind === "focus" ? "night" : timer && timer.kind !== "timer" ? "break" : "day";

  return (
    <section className="stage" data-scene={scene} data-game={inGame}>
      <Room scene={scene} clock={clock} />
      <ConfirmCard />
      {connected && wakeOn && idle && !inGame && (
        <div className="wake-hint" aria-live="polite">
          <span className="wake-dot" aria-hidden /> Say “Hey MIMO”
        </div>
      )}
      <GameStage />

      <div className="stage-mimo">
        <AnimatePresence>
          {shownBubble && (
            <motion.div
              key={shownBubble}
              className="bubble"
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              role="status"
            >
              {shownBubble}
            </motion.div>
          )}
        </AnimatePresence>
        <span className="rug" style={{ background: PALETTE[scene].rug }} aria-hidden />
        <LiveMimo size={230} chatty />
        <div className="mood-chip" aria-live="polite">
          <span className="dot" data-mood={mood} />
          {connected ? MOOD_LABEL[mood] : "Agent offline"}
          {timer && (
            <span className="chip-timer">
              {timer.label} · {formatClock(left)}
            </span>
          )}
        </div>
      </div>

      <TalkBar />
    </section>
  );
}
