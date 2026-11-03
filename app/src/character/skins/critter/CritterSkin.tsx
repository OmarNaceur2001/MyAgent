import { useId, type CSSProperties, type ReactNode } from "react";
import type { Mood } from "../../moods";
import type { CharacterProps } from "../../types";
import "./critter.css";

/*
  MyAgent, the critter: a little round creature who lives inside your computer.
  Signatures (keep them when restyling):
    • big round ears that move with his feelings
    • huge glossy eyes
    • a curl of a tuft on top
    • a cable tail ending in a tiny plug that glows his status colour
  This skin only draws. Moods, beats, gaze and blinks come in as props.
*/

const INK = "#2A2340";
const CREAM = "#FFF1DC";
const BELLY = "#FFF9EE";
const SHADE = "#F3DCC0";
const PINK = "#FF9F93";
const EAR_IN = "#FFB8AA";
const CABLE = "#B9AEE0";

type Eyes = "open" | "wide" | "happy" | "closed" | "up" | "sad" | "confused" | "star" | "small" | "shy";
type Mouth = "smile" | "cat" | "open" | "big" | "o" | "smallO" | "flat" | "squiggle" | "frown" | "yawn" | "talk" | "side";
type Ears = "perk" | "up" | "droop" | "flat" | "tilt" | "listen";
type Tail = "rest" | "up" | "curl" | "droop" | "wag" | "question";

type Pose = {
  eyes: Eyes;
  mouth: Mouth;
  ears: Ears;
  arms: [number, number]; // degrees, + = up
  armLoop?: [number, number, number]; // left/right second angle + speed (s)
  tail: Tail;
  status: string; // plug colour
  blush?: boolean;
  glasses?: boolean;
  extra?: "zzz" | "q" | "sparkles" | "dots" | "waves" | "notes" | "sweat";
};

const POSES: Record<Mood, Pose> = {
  idle: { eyes: "open", mouth: "smile", ears: "perk", arms: [-30, -30], tail: "rest", status: "#7FE6C7" },
  listening: { eyes: "wide", mouth: "smallO", ears: "listen", arms: [-25, 10], tail: "up", status: "#FF8C7A", extra: "waves" },
  thinking: { eyes: "up", mouth: "flat", ears: "tilt", arms: [-30, 45], tail: "curl", status: "#FFC46B", extra: "dots" },
  working: { eyes: "open", mouth: "flat", ears: "perk", arms: [-5, -5], armLoop: [15, 15, 0.5], tail: "wag", status: "#7FE6C7" },
  speaking: { eyes: "open", mouth: "talk", ears: "perk", arms: [-20, 20], armLoop: [-20, 40, 1.2], tail: "rest", status: "#7FE6C7" },
  happy: { eyes: "happy", mouth: "big", ears: "up", arms: [35, 60], armLoop: [35, 75, 0.8], tail: "wag", status: "#FF9FC0" },
  excited: { eyes: "star", mouth: "open", ears: "up", arms: [60, 60], armLoop: [75, 75, 0.5], tail: "wag", status: "#FFC46B", extra: "sparkles" },
  confused: { eyes: "confused", mouth: "squiggle", ears: "tilt", arms: [-40, 50], tail: "question", status: "#C7B3FF", extra: "q" },
  sad: { eyes: "sad", mouth: "frown", ears: "flat", arms: [-65, -65], tail: "droop", status: "#8FB0FF", blush: false },
  sleepy: { eyes: "closed", mouth: "smallO", ears: "droop", arms: [-60, -60], tail: "droop", status: "#8E86B5", extra: "zzz" },
  celebrating: { eyes: "happy", mouth: "big", ears: "up", arms: [70, 70], armLoop: [85, 85, 0.4], tail: "wag", status: "#FFC46B", extra: "sparkles" },
  focus: { eyes: "small", mouth: "flat", ears: "perk", arms: [-20, -20], tail: "rest", status: "#FF8C7A", glasses: true },
};

// Faces some beats borrow for their duration.
const BEAT_FACE: Partial<Record<string, Partial<Pose>>> = {
  yawn: { eyes: "closed", mouth: "yawn", ears: "droop" },
  giggle: { eyes: "happy", mouth: "big" },
  startle: { eyes: "wide", mouth: "o", ears: "up", extra: "sweat" },
  hum: { eyes: "happy", mouth: "cat", extra: "notes" },
  wave: { eyes: "happy", mouth: "open" },
  stretch: { eyes: "closed", mouth: "yawn" },
  spin: { eyes: "star", mouth: "open" },
};

const NO_GAZE: Eyes[] = ["happy", "closed", "up", "star"];

export function CritterSkin({ mood, beat, gaze, blink = 0, size = 220, shadow = true, onPoke, title }: CharacterProps) {
  const uid = useId().replace(/:/g, "");
  const pose: Pose = { ...POSES[mood], ...(beat ? BEAT_FACE[beat.name] : {}) };
  const look = gaze && !NO_GAZE.includes(pose.eyes) ? gaze : { x: 0, y: 0 };
  const faceStyle = {
    transform: `translate(${(look.x * 5).toFixed(2)}px, ${(look.y * 3.5).toFixed(2)}px)`,
    transition: "transform 0.25s ease-out",
  } as CSSProperties;

  return (
    <svg
      viewBox="-24 6 248 196"
      width={size}
      height={(size * 196) / 248}
      role="img"
      aria-label={title ?? `MyAgent is ${mood}`}
      className={`critter${onPoke ? " pokeable" : ""}`}
      data-mood={mood}
      onClick={onPoke}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <radialGradient id={`plug-${uid}`}>
          <stop offset="0" stopColor={pose.status} stopOpacity="0.7" />
          <stop offset="1" stopColor={pose.status} stopOpacity="0" />
        </radialGradient>
      </defs>

      {shadow && <ellipse className="part shadow" cx={100} cy={184} rx={52} ry={6} fill={INK} opacity={0.16} />}

      <g key={beat?.id ?? "rest"} className="part beat" data-beat={beat?.name}>
        <Tail kind={pose.tail} color={pose.status} glow={`url(#plug-${uid})`} />
        <g className="part body">
          <Ear side="L" kind={pose.ears} />
          <Ear side="R" kind={pose.ears} />
          {/* tuft */}
          <path
            className="part tuft"
            d="M98 76 C 92 62, 100 54, 108 58 C 102 60, 102 68, 108 70 C 104 72, 100 74, 98 76Z"
            fill={CREAM}
            stroke={INK}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          {/* body */}
          <path
            d="M100 74 C 140 74, 156 104, 154 134 C 152 162, 132 172, 100 172 C 68 172, 48 162, 46 134 C 44 104, 60 74, 100 74Z"
            fill={CREAM}
            stroke={INK}
            strokeWidth={3.6}
          />
          <path d="M58 150 C 64 164, 80 170, 100 170" fill="none" stroke={SHADE} strokeWidth={6} strokeLinecap="round" />
          <ellipse cx={100} cy={148} rx={29} ry={19} fill={BELLY} />
          <path d="M70 92 C 76 84, 86 80, 94 80" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" opacity={0.9} />
          {/* feet */}
          <ellipse cx={82} cy={174} rx={13} ry={7.5} fill={CREAM} stroke={INK} strokeWidth={3.6} />
          <ellipse cx={118} cy={174} rx={13} ry={7.5} fill={CREAM} stroke={INK} strokeWidth={3.6} />
          {/* paws (in front of the body) */}
          <Arm side="L" angle={pose.arms[0]} loop={pose.armLoop ? [pose.armLoop[0], pose.armLoop[2]] : undefined} />
          <Arm side="R" angle={pose.arms[1]} loop={pose.armLoop ? [pose.armLoop[1], pose.armLoop[2]] : undefined} />
          {pose.blush !== false && (
            <>
              <ellipse cx={68} cy={128} rx={8.5} ry={4.8} fill={PINK} opacity={0.55} />
              <ellipse cx={132} cy={128} rx={8.5} ry={4.8} fill={PINK} opacity={0.55} />
            </>
          )}
          <g style={faceStyle}>
            <EyesShape kind={pose.eyes} blink={blink} />
            {pose.glasses && <Glasses />}
            <MouthShape kind={pose.mouth} />
          </g>
        </g>
        <Extra kind={pose.extra} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- parts

const S = { stroke: INK, strokeWidth: 3.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const EAR_ANGLE: Record<Ears, [number, number]> = {
  perk: [-4, 4],
  up: [-12, 12],
  droop: [-38, 38],
  flat: [-58, 58],
  tilt: [-10, 32],
  listen: [-2, 20],
};

function Ear({ side, kind }: { side: "L" | "R"; kind: Ears }) {
  const cx = side === "L" ? 66 : 134;
  const rot = EAR_ANGLE[kind][side === "L" ? 0 : 1];
  return (
    <g className="part ear" style={{ "--r": `${rot}deg` } as CSSProperties}>
      <ellipse cx={cx} cy={72} rx={21} ry={23} fill={CREAM} {...S} />
      <ellipse cx={cx} cy={74} rx={11.5} ry={13.5} fill={EAR_IN} />
    </g>
  );
}

function Arm({ side, angle, loop }: { side: "L" | "R"; angle: number; loop?: [number, number] }) {
  const x = side === "L" ? 54 : 146;
  const sx = side === "L" ? -1 : 1;
  const style = {
    "--a": `${-angle}deg`,
    "--a2": `${-(loop ? loop[0] : angle)}deg`,
    "--speed": `${loop ? loop[1] : 1}s`,
  } as CSSProperties;
  return (
    <g transform={`translate(${x} 136) scale(${sx} 1)`}>
      <g className={`part arm arm-${side}${loop ? " loop" : ""}`} style={style}>
        <path d="M-4 -7 C 8 -9, 22 -8, 24 0 C 24 8, 10 9, -4 7" fill={CREAM} {...S} />
      </g>
    </g>
  );
}

const TAILS: Record<Tail, string> = {
  rest: "M140 168 C 170 176, 186 160, 178 136",
  up: "M140 166 C 178 170, 186 132, 176 104",
  curl: "M140 168 C 180 178, 196 140, 176 132 C 164 128, 168 112, 182 110",
  droop: "M140 170 C 168 184, 186 186, 192 176",
  wag: "M140 166 C 172 168, 194 150, 188 122",
  question: "M140 168 C 178 176, 192 128, 172 118 C 158 112, 160 98, 176 96",
};

function Tail({ kind, color, glow }: { kind: Tail; color: string; glow: string }) {
  const d = TAILS[kind];
  const end = d.split(/[ ,]+/).filter(Boolean).slice(-2).map(Number);
  return (
    <g className="part tail" data-tail={kind}>
      <path d={d} fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <path d={d} fill="none" stroke={CABLE} strokeWidth={3.5} strokeLinecap="round" />
      <circle className="plug-glow" cx={end[0]} cy={end[1] - 6} r={16} fill={glow} />
      <g transform={`translate(${end[0]} ${end[1]})`}>
        <rect x={-6.5} y={-11} width={13} height={13} rx={4} fill={CREAM} {...S} strokeWidth={3} />
        <path d="M-3 -11 V-17 M3 -11 V-17" {...S} strokeWidth={3} />
        <circle cx={0} cy={-4.5} r={2.6} fill={color} style={{ transition: "fill .4s" }} />
      </g>
    </g>
  );
}

const LX = 82;
const RX = 118;
const EY = 112;

function Glossy({ cx, cy, h = 10.5, w = 8 }: { cx: number; cy: number; h?: number; w?: number }) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={w} ry={h} fill={INK} />
      <circle cx={cx + 2.6} cy={cy - 4} r={3.1} fill="#fff" />
      <circle cx={cx - 2.4} cy={cy + 4} r={1.5} fill="#fff" />
    </>
  );
}

const arcUp = (cx: number, cy: number) => <path d={`M${cx - 8} ${cy + 3} Q${cx} ${cy - 8} ${cx + 8} ${cy + 3}`} fill="none" {...S} strokeWidth={4} />;
const arcDn = (cx: number, cy: number) => <path d={`M${cx - 8} ${cy - 1} Q${cx} ${cy + 7} ${cx + 8} ${cy - 1}`} fill="none" {...S} strokeWidth={4} />;
const star = (cx: number, cy: number, r = 10) =>
  `M${cx} ${cy - r} Q${cx + 2} ${cy - 2} ${cx + r} ${cy} Q${cx + 2} ${cy + 2} ${cx} ${cy + r} Q${cx - 2} ${cy + 2} ${cx - r} ${cy} Q${cx - 2} ${cy - 2} ${cx} ${cy - r}Z`;

function EyesShape({ kind, blink }: { kind: Eyes; blink: number }) {
  const blinkable = (children: ReactNode) => (
    <g key={blink} className={blink ? "part blink-once" : "part"}>
      {children}
    </g>
  );
  switch (kind) {
    case "open":
      return blinkable(<><Glossy cx={LX} cy={EY} /><Glossy cx={RX} cy={EY} /></>);
    case "small":
      return blinkable(<><Glossy cx={LX} cy={EY} h={8} w={6.5} /><Glossy cx={RX} cy={EY} h={8} w={6.5} /></>);
    case "wide":
      return blinkable(<><Glossy cx={LX} cy={EY} h={12.5} w={9.5} /><Glossy cx={RX} cy={EY} h={12.5} w={9.5} /></>);
    case "shy":
      return blinkable(<><Glossy cx={LX - 3} cy={EY + 3} h={9.5} w={7.5} /><Glossy cx={RX - 3} cy={EY + 3} h={9.5} w={7.5} /></>);
    case "happy":
      return <>{arcUp(LX, EY)}{arcUp(RX, EY)}</>;
    case "closed":
      return <>{arcDn(LX, EY + 2)}{arcDn(RX, EY + 2)}</>;
    case "up":
      return <><Glossy cx={LX + 3} cy={EY - 3} h={10} w={7.5} /><Glossy cx={RX + 3} cy={EY - 3} h={10} w={7.5} /></>;
    case "sad":
      return (
        <>
          <Glossy cx={LX} cy={EY + 2} h={9.5} w={7.5} />
          <Glossy cx={RX} cy={EY + 2} h={9.5} w={7.5} />
          <path d={`M${LX - 9} ${EY - 12} L${LX + 5} ${EY - 15}`} {...S} strokeWidth={3} />
          <path d={`M${RX + 9} ${EY - 12} L${RX - 5} ${EY - 15}`} {...S} strokeWidth={3} />
        </>
      );
    case "confused":
      return (
        <>
          <Glossy cx={LX} cy={EY} />
          <path d={`M${RX - 8} ${EY + 1} L${RX + 8} ${EY - 2}`} {...S} strokeWidth={4} />
          <path d={`M${RX - 8} ${EY - 13} Q${RX} ${EY - 18} ${RX + 8} ${EY - 12}`} fill="none" {...S} strokeWidth={3} />
        </>
      );
    case "star":
      return (
        <g className="part twinkle-eyes">
          <path d={star(LX, EY)} fill={INK} />
          <path d={star(RX, EY)} fill={INK} />
          <circle cx={LX + 2} cy={EY - 3} r={1.8} fill="#fff" />
          <circle cx={RX + 2} cy={EY - 3} r={1.8} fill="#fff" />
        </g>
      );
  }
}

function Glasses() {
  return (
    <g fill="none" stroke={INK} strokeWidth={3}>
      <circle cx={LX} cy={EY} r={13} fill="#fff" fillOpacity={0.25} />
      <circle cx={RX} cy={EY} r={13} fill="#fff" fillOpacity={0.25} />
      <path d={`M${LX + 13} ${EY} Q100 ${EY - 5} ${RX - 13} ${EY}`} />
    </g>
  );
}

function MouthShape({ kind }: { kind: Mouth }) {
  switch (kind) {
    case "smile":
      return <path d="M94 127 Q100 133 106 127" fill="none" {...S} strokeWidth={3.2} />;
    case "cat":
      return <path d="M92 126 Q96 131 100 127 Q104 131 108 126" fill="none" {...S} strokeWidth={3.2} />;
    case "open":
      return (
        <>
          <path d="M92 125 Q100 125 108 125 Q107 138 100 138 Q93 138 92 125Z" fill={INK} />
          <path d="M95 133 Q100 130 105 133 Q103 137 100 137 Q97 137 95 133Z" fill={PINK} />
        </>
      );
    case "big":
      return (
        <>
          <path d="M89 124 Q100 124 111 124 Q110 142 100 142 Q90 142 89 124Z" fill={INK} />
          <path d="M93 135 Q100 130 107 135 Q105 141 100 141 Q95 141 93 135Z" fill={PINK} />
        </>
      );
    case "o":
      return <ellipse cx={100} cy={130} rx={4} ry={5} fill={INK} />;
    case "smallO":
      return <ellipse cx={100} cy={129} rx={2.6} ry={3} fill={INK} />;
    case "flat":
      return <path d="M95 129 L105 128" {...S} strokeWidth={3.2} />;
    case "squiggle":
      return <path d="M91 130 Q95 126 99 130 T107 130" fill="none" {...S} strokeWidth={3} />;
    case "frown":
      return <path d="M94 132 Q100 126 106 132" fill="none" {...S} strokeWidth={3.2} />;
    case "yawn":
      return (
        <>
          <ellipse cx={100} cy={132} rx={7} ry={9} fill={INK} />
          <ellipse cx={100} cy={136} rx={4} ry={3.5} fill={PINK} />
        </>
      );
    case "side":
      return <path d="M97 129 Q103 131 107 126" fill="none" {...S} strokeWidth={3.2} />;
    case "talk":
      // two mouth shapes alternate in CSS: open / smile
      return (
        <>
          <path className="mouth-a" d="M93 126 Q100 126 107 126 Q106 135 100 135 Q94 135 93 126Z" fill={INK} />
          <path className="mouth-b" d="M94 127 Q100 133 106 127" fill="none" {...S} strokeWidth={3.2} />
        </>
      );
  }
}

function sparkle(x: number, y: number, r: number, color: string, i: number) {
  return (
    <path
      key={i}
      className="part pop"
      style={{ animationDelay: `${i * 0.15}s` }}
      d={`M${x} ${y - r} Q${x + 1.5} ${y - 1.5} ${x + r} ${y} Q${x + 1.5} ${y + 1.5} ${x} ${y + r} Q${x - 1.5} ${y + 1.5} ${x - r} ${y} Q${x - 1.5} ${y - 1.5} ${x} ${y - r}Z`}
      fill={color}
      stroke={INK}
      strokeWidth={2}
    />
  );
}

function Extra({ kind }: { kind?: Pose["extra"] }) {
  const font = { fontFamily: "Fredoka, sans-serif", fontWeight: 600 };
  switch (kind) {
    case "zzz":
      return (
        <g fill={INK} {...font}>
          {["z", "z", "Z"].map((z, i) => (
            <text key={i} className="part float-up" style={{ animationDelay: `${i * 0.9}s` }} x={150 + i * 13} y={70 - i * 16} fontSize={16 + i * 5}>
              {z}
            </text>
          ))}
        </g>
      );
    case "q":
      return (
        <text className="part wobble" x={150} y={66} {...font} fontSize={34} fill="#C7B3FF" stroke={INK} strokeWidth={2.5} paintOrder="stroke">
          ?
        </text>
      );
    case "sparkles":
      return (
        <g>
          {[
            [36, 70, 9, "#FFC46B"],
            [168, 62, 11, "#FF9FC0"],
            [24, 118, 6, "#7FE6C7"],
            [182, 100, 6, "#FFC46B"],
            [52, 40, 5, "#C7B3FF"],
          ].map(([x, y, r, c], i) => sparkle(x as number, y as number, r as number, c as string, i))}
        </g>
      );
    case "dots":
      return (
        <g fill="#fff" stroke={INK} strokeWidth={2.5}>
          {[
            [150, 78, 4],
            [162, 62, 6],
            [178, 42, 9],
          ].map(([x, y, r], i) => (
            <circle key={i} className="part pulse" style={{ animationDelay: `${i * 0.25}s` }} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "waves":
      return (
        <g fill="none" stroke="#FF8C7A" strokeWidth={4} strokeLinecap="round">
          <path className="part pulse" d="M30 100 Q22 112 30 124" />
          <path className="part pulse" style={{ animationDelay: ".3s" }} d="M20 92 Q8 112 20 132" />
        </g>
      );
    case "notes":
      return (
        <g fill={INK} {...font}>
          {["♪", "♫", "♪"].map((n, i) => (
            <text key={i} className="part float-up" style={{ animationDelay: `${i * 0.6}s` }} x={30 + i * 70} y={70 - (i % 2) * 14} fontSize={22}>
              {n}
            </text>
          ))}
        </g>
      );
    case "sweat":
      return <path d="M146 96 Q152 106 146 110 Q140 106 146 96Z" fill="#9FD3FF" stroke={INK} strokeWidth={2.2} />;
    default:
      return null;
  }
}
