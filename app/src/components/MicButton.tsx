import { Mic } from "lucide-react";
import { useRef } from "react";
import { send, useMimo } from "../lib/store";

// Hold to talk, or tap once to start and tap again to stop.
// Recording happens in the agent (Python), so the UI only sends start/stop.
export function MicButton({ small = false }: { small?: boolean }) {
  const voice = useMimo((s) => s.features?.voice ?? false);
  const listening = useMimo((s) => s.agentState === "listening");
  const pressedAt = useRef(0);
  const toggled = useRef(false);

  const down = () => {
    if (!voice) return;
    if (toggled.current) {
      toggled.current = false;
      send("voice.stop");
      return;
    }
    pressedAt.current = Date.now();
    send("voice.start");
  };
  const up = () => {
    if (!voice || !pressedAt.current) return;
    const held = Date.now() - pressedAt.current;
    pressedAt.current = 0;
    if (held < 300) toggled.current = true; // a tap: keep listening until the next tap
    else send("voice.stop");
  };

  return (
    <button
      type="button"
      className={`mic-btn${small ? " small" : ""}`}
      data-listening={listening}
      disabled={!voice}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={() => pressedAt.current && up()}
      aria-pressed={listening}
      aria-label={voice ? (listening ? "Stop listening" : "Talk to MIMO") : "Voice isn't set up"}
      title={voice ? "Hold to talk, or tap to start/stop" : "Voice isn't set up yet: see agent/voice.py"}
    >
      <Mic size={small ? 14 : 22} strokeWidth={small ? 3 : 2.5} />
    </button>
  );
}
