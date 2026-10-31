import { useEffect, useRef, useState, type RefObject } from "react";
import type { Beat, Gaze, Mood } from "../character";
import { isLateNight } from "./personality";
import { greet, playBeat, speakLine, useMimo } from "./store";

/*
  MIMO's "life": the small things that make it feel alive between real events.
    • blinks at random moments (sometimes twice)
    • eyes follow the cursor, then drift back when you stop moving
    • idle actions now and then (hum, stretch, look around, yawn late at night)
    • a wave when you come back after a while
  It only adds flavour: real events (store.ts) always win over idle behaviour.
  All timers are plain setTimeouts, so this costs nothing when nothing happens.
*/

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const AWAY_BEFORE_WELCOME_MS = 3 * 60 * 1000;

export function useLife(mood: Mood, anchor: RefObject<HTMLElement | null>, opts: { chatty?: boolean } = {}) {
  const [blink, setBlink] = useState(0);
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: 0 });
  const moodRef = useRef(mood);
  moodRef.current = mood;

  // --- blinking ---
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        if (moodRef.current !== "sleepy") {
          setBlink((b) => b + 1);
          if (Math.random() < 0.18) setTimeout(() => setBlink((b) => b + 1), 260); // double blink
        }
        loop();
      }, rand(2200, 6000));
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // --- eyes follow the cursor ---
  useEffect(() => {
    let rest: ReturnType<typeof setTimeout>;
    const onMove = (e: MouseEvent) => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.4;
      setGaze({ x: clamp((e.clientX - cx) / 260), y: clamp((e.clientY - cy) / 220) });
      clearTimeout(rest);
      rest = setTimeout(() => setGaze({ x: 0, y: 0 }), 2500);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimeout(rest);
    };
  }, [anchor]);

  // --- idle behaviours ---
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const lookAround = () => {
      const seq: Gaze[] = [
        { x: -0.9, y: -0.2 },
        { x: 0.9, y: -0.1 },
        { x: 0, y: 0.3 },
        { x: 0, y: 0 },
      ];
      seq.forEach((g, i) => setTimeout(() => setGaze(g), i * 700));
    };
    const loop = () => {
      const m = moodRef.current;
      // calm during focus, frequent-ish when idle, nothing while busy or asleep
      const wait = m === "focus" ? rand(70_000, 140_000) : rand(14_000, 32_000);
      t = setTimeout(() => {
        const s = useMimo.getState();
        const quietFor = Date.now() - s.lastActivity;
        const m2 = moodRef.current;
        if (!s.beat && (m2 === "idle" || m2 === "focus")) {
          if (m2 === "focus") {
            playBeat(Math.random() < 0.5 ? "nod" : "stretch");
          } else {
            const late = isLateNight();
            const options: (Beat | "look")[] = late
              ? ["yawn", "yawn", "look", "stretch"]
              : ["hum", "look", "look", "stretch", "nod"];
            const choice = options[Math.floor(Math.random() * options.length)];
            if (choice === "look") lookAround();
            else playBeat(choice);
            // speak rarely, and only when the user has been quiet a while
            if (opts.chatty && quietFor > 120_000 && Math.random() < 0.3) {
              speakLine(late ? "lateNight" : "idleChatter");
            }
          }
        }
        loop();
      }, wait);
    };
    loop();
    return () => clearTimeout(t);
  }, [opts.chatty]);

  // --- welcome back ---
  useEffect(() => {
    let leftAt = 0;
    const onBlur = () => (leftAt = Date.now());
    const onFocus = () => {
      if (leftAt && Date.now() - leftAt > AWAY_BEFORE_WELCOME_MS) greet("welcomeBack");
      leftAt = 0;
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { blink, gaze };
}

