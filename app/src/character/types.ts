import type { Mood } from "./moods";

/*
  The contract every character skin implements.
  A skin only DRAWS: it gets these props and renders them. It never reads the
  store, talks to the agent or decides when to act. That logic lives in
  lib/life.ts, so a new design is a new folder in skins/ and nothing else changes.
*/

/** One-shot actions played on top of the current mood. */
export const BEATS = [
  "wave",
  "hop",
  "nod",
  "shake",
  "spin",
  "yawn",
  "stretch",
  "giggle",
  "startle",
  "hum",
] as const;
export type Beat = (typeof BEATS)[number];

/** How long each beat lasts (ms). The life system uses this to know when it's over. */
export const BEAT_MS: Record<Beat, number> = {
  wave: 1400,
  hop: 600,
  nod: 800,
  shake: 700,
  spin: 900,
  yawn: 1800,
  stretch: 1500,
  giggle: 900,
  startle: 700,
  hum: 2400,
};

/** A beat to play; a new `id` replays it even if the name is the same. */
export type BeatCue = { name: Beat; id: number };

/** Where the character looks, -1..1 on each axis (0,0 = straight ahead). */
export type Gaze = { x: number; y: number };

export type CharacterProps = {
  mood: Mood;
  beat?: BeatCue | null;
  gaze?: Gaze;
  /** Changes whenever the character should blink once. */
  blink?: number;
  size?: number;
  /** Floor shadow (off for the floating companion). */
  shadow?: boolean;
  /** Called when the user clicks the character. */
  onPoke?: () => void;
  title?: string;
};
