import type { CSSProperties } from "react";
import type { Mood } from "../../moods";
import type { CharacterProps } from "../../types";
import "./omar.css";

// The supplied renders are deliberately mapped to real app moods rather than
// changing mood selection or inventing new state in the character layer.
const RENDER: Record<Mood, string> = {
  idle: "idle",
  listening: "happy",
  thinking: "checking-time",
  working: "focused",
  speaking: "happy",
  happy: "happy",
  excited: "happy",
  confused: "idle",
  sad: "sad",
  sleepy: "sleeping",
  celebrating: "happy",
  focus: "studying",
};

export function OmarSkin({
  mood,
  beat,
  gaze,
  size = 220,
  shadow = true,
  onPoke,
  title,
}: CharacterProps) {
  const frame = RENDER[mood];
  const style = {
    "--omar-size": `${size}px`,
    "--omar-gaze-x": `${((gaze?.x ?? 0) * 2.5).toFixed(1)}px`,
    "--omar-gaze-y": `${((gaze?.y ?? 0) * 1.5).toFixed(1)}px`,
  } as CSSProperties;

  return (
    <div
      className={`omar-character${onPoke ? " pokeable" : ""}`}
      data-mood={mood}
      data-beat={beat?.name ?? "rest"}
      role="img"
      aria-label={title ?? `Omar is ${mood}`}
      onClick={onPoke}
      style={style}
    >
      {shadow && <span className="omar-shadow" aria-hidden />}
      <img
        className="omar-render"
        src={`./characters/omar/omar-${frame}.webp`}
        alt=""
        draggable={false}
      />
    </div>
  );
}
