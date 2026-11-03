import { AnimatePresence, motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LiveMyAgent } from "../components/LiveMyAgent";
import { MicButton } from "../components/MicButton";
import { formatClock, useSecondsLeft } from "../components/time";
import { desktop } from "../lib/desktop";
import { send, useMyAgent } from "../lib/store";
import "./companion.css";

// The little MyAgent that floats on the desktop.
// Drag it anywhere; double-click to open the full app; right-click for the menu.
export function Companion() {
  const bubble = useMyAgent((s) => s.bubble);
  const timer = useMyAgent((s) => s.timer);
  const left = useSecondsLeft();
  const [text, setText] = useState<string | null>(null);
  // Only MyAgent and its buttons catch the mouse; the empty window area lets clicks through.
  const hover = {
    onMouseEnter: () => desktop.setCompanionHover(true),
    onMouseLeave: () => desktop.setCompanionHover(false),
  };

  // Drag the window by its character. Window position = pointer position on
  // screen minus where inside the window the pointer was grabbed.
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX, dy: e.clientY, sx: e.screenX, sy: e.screenY, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.screenX - d.sx, e.screenY - d.sy) < 4) return; // still a click
    d.moved = true;
    desktop.moveCompanion(e.screenX - d.dx, e.screenY - d.dy);
  };
  const onPointerUp = () => {
    if (drag.current?.moved) desktop.companionDragEnd();
    drag.current = null;
  };

  // Global shortcut: start listening, or stop if already listening.
  useEffect(
    () =>
      desktop.onTalkShortcut(() => {
        const s = useMyAgent.getState();
        if (!s.features?.voice) return;
        send(s.agentState === "listening" ? "voice.stop" : "voice.start");
      }),
    [],
  );

  useEffect(() => {
    document.body.classList.add("transparent");
    return () => document.body.classList.remove("transparent");
  }, []);

  useEffect(() => {
    if (!bubble) return;
    setText(bubble.text);
    const t = setTimeout(() => setText(null), Math.min(12000, Math.max(4000, bubble.text.length * 60)));
    return () => clearTimeout(t);
  }, [bubble]);

  return (
    <div
      className="companion"
      onContextMenu={(e) => {
        e.preventDefault();
        desktop.companionMenu();
      }}
    >
      <div className="c-bubble-slot">
        <AnimatePresence>
          {text && (
            <motion.div
              key={text}
              className="c-bubble"
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
            >
              {text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className="c-body drag"
        {...hover}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => desktop.openMain()} title="Double-click to open MyAgent">
        <LiveMyAgent size={160} shadow={false} />
      </div>

      <div className="c-footer" {...hover}>
        {timer && (
          <span className="c-timer" data-kind={timer.kind} data-paused={timer.status === "paused"}>
            {formatClock(left)}
          </span>
        )}
        <MicButton small />
        <button className="c-open" onClick={() => desktop.openMain()} aria-label="Open MyAgent" title="Open MyAgent">
          <Maximize2 size={14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
