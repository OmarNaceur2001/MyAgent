import { useRef } from "react";
import { Character } from "../character";
import { useLife } from "../lib/life";
import { poke, useMyAgent, useMood } from "../lib/store";

// Connects the pure character drawing to the app: real events (store)
// + life behaviours (life.ts) → props. Swap the skin and this stays the same.
export function LiveMyAgent({ size, shadow = true, chatty = false }: { size: number; shadow?: boolean; chatty?: boolean }) {
  const mood = useMood();
  const beat = useMyAgent((s) => s.beat);
  const anchor = useRef<HTMLDivElement>(null);
  const { blink, gaze } = useLife(mood, anchor, { chatty });

  return (
    <div ref={anchor}>
      <Character mood={mood} beat={beat} gaze={gaze} blink={blink} size={size} shadow={shadow} onPoke={poke} />
    </div>
  );
}
