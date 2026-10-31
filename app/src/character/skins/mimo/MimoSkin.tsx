import { motion } from "framer-motion";
import { useId, type CSSProperties } from "react";
import type { Mood } from "../../moods";
import type { CharacterProps } from "../../types";
import { Face, type Expression } from "./Face";
import "./mimo.css";

/*
  MIMO — an original pocket-computer character.
  Signature features (keep these when restyling, they make MIMO recognisable):
    • soft periwinkle squircle body
    • a dark "night screen" face with glowing mint features
    • an antenna light that shows MIMO's status colour
    • one big coral button + two small pill buttons
  Everything is vector, so it stays sharp at any size and costs almost no GPU.
*/

const C = {
  ink: "#2B2748",
  body: "#A9B4F5",
  bodyShade: "#8E9AE8",
  bodyLight: "#C9D0FF",
  screen: "#1C1F3D",
  coral: "#FF8A7A",
  butter: "#FFD66B",
  mint: "#7EF2CF",
  feet: "#8390E0",
};

// Antenna light colour per mood: doubles as a status light you can read
// at a glance, even when MIMO is tiny on the desktop.
const ANTENNA: Record<Mood, string> = {
  idle: "#7EF2CF",
  listening: "#FF8A7A",
  thinking: "#FFD66B",
  working: "#7EF2CF",
  speaking: "#7EF2CF",
  happy: "#FFA8C5",
  excited: "#FFD66B",
  confused: "#C8B6FF",
  sad: "#8FB4FF",
  sleepy: "#8C88A8",
  celebrating: "#FFD66B",
  focus: "#FF8A7A",
};

// Some beats change the face for their duration.
const BEAT_FACE: Partial<Record<string, Expression>> = {
  yawn: "yawn",
  giggle: "happy",
  startle: "surprised",
  hum: "humming",
  wave: "happy",
  stretch: "yawn",
};

// The eyes don't follow the cursor in these moods (eyes closed or busy).
const NO_GAZE = new Set<Mood>(["sleepy", "happy", "celebrating", "thinking"]);

// Body motion per mood lives in mimo.css (keyed on data-mood).

// Arm angle in degrees: 0 = straight out, positive = up, negative = down.
const ARMS: Record<Mood, { left: number | [number, number]; right: number | [number, number]; speed?: number }> = {
  idle: { left: -35, right: -35 },
  listening: { left: -30, right: 20 },
  thinking: { left: -35, right: 55 },
  working: { left: [-10, 10], right: [10, -10], speed: 0.5 },
  speaking: { left: -30, right: [-20, 5], speed: 1.4 },
  happy: { left: -25, right: [30, 60], speed: 0.8 },
  excited: { left: [40, 70], right: [40, 70], speed: 0.55 },
  confused: { left: -40, right: 65 },
  sad: { left: -65, right: -65 },
  sleepy: { left: -60, right: -60 },
  celebrating: { left: [65, 85], right: [65, 85], speed: 0.4 },
  focus: { left: -20, right: -20 },
};

export function MimoSkin({ mood, beat, gaze, blink = 0, size = 220, shadow = true, onPoke, title }: CharacterProps) {
  const uid = useId().replace(/:/g, "");
  const arms = ARMS[mood];
  const antenna = ANTENNA[mood];
  const expression: Expression = (beat && BEAT_FACE[beat.name]) || mood;
  const look = gaze && !NO_GAZE.has(mood) && expression === mood ? gaze : { x: 0, y: 0 };
  const faceStyle = {
    transform: `translate(${(look.x * 6).toFixed(2)}px, ${(look.y * 4).toFixed(2)}px)`,
    transition: "transform 0.25s ease-out",
  } as CSSProperties;

  return (
    <svg
      viewBox="0 0 220 260"
      width={size}
      height={(size * 260) / 220}
      role="img"
      aria-label={title ?? `MIMO is ${mood}`}
      className={`mimo${onPoke ? " pokeable" : ""}`}
      data-mood={mood}
      onClick={onPoke}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id={`scan-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1.2" fill="#ffffff" opacity="0.05" />
        </pattern>
        <radialGradient id={`screen-${uid}`} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#2A2E58" />
          <stop offset="100%" stopColor={C.screen} />
        </radialGradient>
      </defs>

      {shadow && (
        <ellipse className="part shadow" cx={110} cy={246} rx={54} ry={8} fill={C.ink} opacity={0.14} />
      )}

      {/* feet stay planted while the body moves */}
      <ellipse cx={86} cy={228} rx={17} ry={10} fill={C.feet} stroke={C.ink} strokeWidth={4} />
      <ellipse cx={134} cy={228} rx={17} ry={10} fill={C.feet} stroke={C.ink} strokeWidth={4} />

      {/* beat wrapper: keyed by beat id so each cue replays its one-shot animation */}
      <g key={beat?.id ?? "rest"} className="part beat" data-beat={beat?.name}>
      <g className="part body">
        {/* antenna */}
        <line x1={110} y1={50} x2={110} y2={26} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
        <motion.circle
          cx={110}
          cy={19}
          r={15}
          fill={antenna}
          animate={{
            opacity: mood === "sleepy" ? 0.08 : mood === "listening" || mood === "working" ? [0.15, 0.5, 0.15] : 0.25,
          }}
          transition={{ duration: mood === "working" ? 0.6 : 1.2, repeat: Infinity }}
        />
        <motion.circle
          cx={110}
          cy={19}
          r={8}
          stroke={C.ink}
          strokeWidth={3.5}
          animate={{ fill: antenna }}
          transition={{ duration: 0.4 }}
        />

        {/* arms (drawn before the body so they tuck behind it) */}
        <Arm x={44} y={150} angle={arms.left} speed={arms.speed} side="left" />
        <Arm x={176} y={150} angle={arms.right} speed={arms.speed} side="right" />

        {/* body */}
        <rect x={40} y={48} width={140} height={172} rx={42} fill={C.body} stroke={C.ink} strokeWidth={4} />
        <path d="M58 70 Q58 60 70 58" stroke={C.bodyLight} strokeWidth={6} strokeLinecap="round" fill="none" />
        <path d="M168 196 Q166 208 152 212" stroke={C.bodyShade} strokeWidth={6} strokeLinecap="round" fill="none" />

        {/* screen */}
        <rect x={54} y={64} width={112} height={92} rx={24} fill={C.ink} />
        <rect x={61} y={71} width={98} height={78} rx={18} fill={`url(#screen-${uid})`} />
        <rect x={61} y={71} width={98} height={78} rx={18} fill={`url(#scan-${uid})`} />
        <g filter={`url(#glow-${uid})`}>
          <g style={faceStyle}>
            <Face expression={expression} blink={blink} />
          </g>
        </g>
        <path d="M70 80 Q74 75 82 75" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={3} strokeLinecap="round" fill="none" />

        {/* controls */}
        <rect x={66} y={174} width={26} height={9} rx={4.5} fill={C.butter} stroke={C.ink} strokeWidth={3} />
        <rect x={66} y={190} width={26} height={9} rx={4.5} fill={C.mint} stroke={C.ink} strokeWidth={3} />
        <circle cx={108} cy={180} r={2.6} fill={C.ink} opacity={0.5} />
        <circle cx={108} cy={190} r={2.6} fill={C.ink} opacity={0.5} />
        <circle cx={108} cy={200} r={2.6} fill={C.ink} opacity={0.5} />
        <circle cx={145} cy={187} r={13} fill={C.coral} stroke={C.ink} strokeWidth={3.5} />
        <circle cx={141} cy={183} r={3.5} fill="#ffffff" opacity={0.55} />

        <Extras mood={mood} />
        {beat?.name === "hum" && <Notes />}
      </g>
      </g>
    </svg>
  );
}

function Arm({
  x,
  y,
  angle,
  speed,
  side,
}: {
  x: number;
  y: number;
  angle: number | [number, number];
  speed?: number;
  side: "left" | "right";
}) {
  const mirror = side === "right";
  // The capsule points left from the shoulder; the right arm is mirrored.
  // Rotating clockwise lifts a left-pointing arm, so "positive = up" holds for both.
  const loop = Array.isArray(angle);
  const [a, a2] = loop ? angle : [angle, angle];
  const style = { "--a": `${a}deg`, "--a2": `${a2}deg`, "--speed": `${speed ?? 1}s` } as CSSProperties;
  return (
    <g transform={`translate(${x} ${y})${mirror ? " scale(-1 1)" : ""}`}>
      <g className={`part arm ${side}${loop ? " loop" : ""}`} style={style}>
        <rect x={-30} y={-8} width={34} height={16} rx={8} fill="#8E9AE8" stroke="#2B2748" strokeWidth={4} />
      </g>
    </g>
  );
}

// Little things that float around MIMO for some moods.
function Extras({ mood }: { mood: Mood }) {
  const ink = "#2B2748";
  if (mood === "sleepy") {
    return (
      <g fontFamily="Fredoka, sans-serif" fontWeight={600} fill={ink}>
        {[0, 1, 2].map((i) => (
          <text
            key={i}
            className="part float-z"
            style={{ animationDelay: `${i * 0.9}s` }}
            x={168 + i * 10}
            y={52 - i * 14}
            fontSize={14 + i * 4}
          >
            z
          </text>
        ))}
      </g>
    );
  }
  if (mood === "thinking") {
    return (
      <g fill="#FFD66B" stroke={ink} strokeWidth={2.5}>
        {[0, 1, 2].map((i) => (
          <circle key={i} className="pulse" style={{ animationDelay: `${i * 0.25}s` }} cx={170 + i * 12} cy={44 - i * 12} r={3 + i * 2} />
        ))}
      </g>
    );
  }
  if (mood === "confused") {
    return (
      <text
        className="part wobble"
        x={176}
        y={48}
        fontFamily="Fredoka, sans-serif"
        fontWeight={700}
        fontSize={30}
        fill="#C8B6FF"
        stroke={ink}
        strokeWidth={2}
        paintOrder="stroke"
      >
        ?
      </text>
    );
  }
  if (mood === "celebrating" || mood === "excited") {
    const bits = [
      { x: 30, y: 40, c: "#FFD66B" },
      { x: 186, y: 34, c: "#FF8A7A" },
      { x: 18, y: 110, c: "#7EF2CF" },
      { x: 200, y: 100, c: "#FFA8C5" },
      { x: 50, y: 14, c: "#C8B6FF" },
      { x: 166, y: 8, c: "#7EF2CF" },
    ];
    return (
      <g>
        {bits.map((b, i) => (
          <rect
            key={i}
            className="part confetti"
            style={{ animationDelay: `${i * 0.12}s`, animationDuration: `${1 + (i % 3) * 0.3}s` }}
            x={b.x}
            y={b.y}
            width={8}
            height={8}
            rx={2}
            fill={b.c}
            stroke={ink}
            strokeWidth={2}
          />
        ))}
      </g>
    );
  }
  if (mood === "listening") {
    return (
      <g stroke="#FF8A7A" strokeWidth={4} strokeLinecap="round" fill="none">
        {[0, 1].map((i) => (
          <path
            key={i}
            className="pulse"
            style={{ animationDelay: `${i * 0.3}s` }}
            d={`M${188 + i * 10} ${92 - i * 8} Q${198 + i * 12} ${110} ${188 + i * 10} ${128 + i * 8}`}
          />
        ))}
      </g>
    );
  }
  return null;
}

// Little music notes floating up while MIMO hums.
function Notes() {
  return (
    <g fill="#2B2748" fontFamily="Fredoka, sans-serif" fontWeight={600}>
      {["♪", "♫", "♪"].map((n, i) => (
        <text key={i} className="part float-z" style={{ animationDelay: `${i * 0.6}s` }} x={170 + i * 9} y={60 - i * 12} fontSize={18}>
          {n}
        </text>
      ))}
    </g>
  );
}
