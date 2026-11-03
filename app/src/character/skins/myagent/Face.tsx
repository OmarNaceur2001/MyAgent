import { AnimatePresence, motion } from "framer-motion";
import type { Mood } from "../../moods";

// MyAgent's face, drawn as glowing lines on its dark screen.
// Screen area: x 61–159, y 71–149. Eyes sit at (90,104) and (130,104).

const GLOW = "#7EF2CF";
const BLUSH = "#FFA8C5";
const LINE = { stroke: GLOW, strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };

const LX = 90;
const RX = 130;
const EY = 104;

/** Every mood, plus a few faces only used during beats. */
export type Expression = Mood | "yawn" | "surprised" | "humming";

export function Face({ expression, blink }: { expression: Expression; blink: number }) {
  // quick cross-fade between expressions
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.g
        key={expression}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      >
        {FACES[expression](blink)}
      </motion.g>
    </AnimatePresence>
  );
}

// Eyes that blink once each time `n` changes (the life system decides when).
const Blink = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <g key={n} className={n ? "part blink-once" : "part"}>
    {children}
  </g>
);


const PillEyes = ({ h = 18, dx = 0, dy = 0 }: { h?: number; dx?: number; dy?: number }) => (
  <>
    <rect x={LX - 5 + dx} y={EY - h / 2 + dy} width={10} height={h} rx={5} fill={GLOW} />
    <rect x={RX - 5 + dx} y={EY - h / 2 + dy} width={10} height={h} rx={5} fill={GLOW} />
  </>
);

const Blush = () => (
  <>
    <rect x={70} y={116} width={12} height={6} rx={3} fill={BLUSH} opacity={0.85} />
    <rect x={138} y={116} width={12} height={6} rx={3} fill={BLUSH} opacity={0.85} />
  </>
);

const HappyEyes = () => (
  <>
    <path d={`M${LX - 9} ${EY + 4} Q${LX} ${EY - 8} ${LX + 9} ${EY + 4}`} {...LINE} />
    <path d={`M${RX - 9} ${EY + 4} Q${RX} ${EY - 8} ${RX + 9} ${EY + 4}`} {...LINE} />
  </>
);

const star = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx + 2} ${cy - 2} ${cx + r} ${cy} Q${cx + 2} ${cy + 2} ${cx} ${cy + r} Q${cx - 2} ${cy + 2} ${cx - r} ${cy} Q${cx - 2} ${cy - 2} ${cx} ${cy - r}Z`;

const FACES: Record<Expression, (blink: number) => JSX.Element> = {
  idle: (b) => (
    <>
      <Blink n={b}>
        <PillEyes />
      </Blink>
      <path d="M102 124 Q110 131 118 124" {...LINE} />
    </>
  ),

  listening: (b) => (
    <>
      <Blink n={b}>
        <circle cx={LX} cy={EY} r={8} fill={GLOW} />
        <circle cx={RX} cy={EY} r={8} fill={GLOW} />
        <circle cx={LX + 2.5} cy={EY - 2.5} r={2.5} fill="#1C1F3D" />
        <circle cx={RX + 2.5} cy={EY - 2.5} r={2.5} fill="#1C1F3D" />
      </Blink>
      <circle cx={110} cy={127} r={4} {...LINE} strokeWidth={4} />
    </>
  ),

  thinking: () => (
    <>
      <PillEyes h={13} dx={5} dy={-5} />
      <path d="M103 127 L117 124" {...LINE} />
    </>
  ),

  working: () => (
    <>
      <rect x={LX - 8} y={EY - 3} width={16} height={7} rx={3.5} fill={GLOW} />
      <rect x={RX - 8} y={EY - 3} width={16} height={7} rx={3.5} fill={GLOW} />
      <path d="M104 122 L116 122" {...LINE} />
      {/* progress strip: shows MyAgent is busy doing something */}
      <rect x={78} y={134} width={64} height={5} rx={2.5} fill={GLOW} opacity={0.2} />
      <motion.rect
        x={78}
        y={134}
        height={5}
        rx={2.5}
        fill={GLOW}
        initial={{ width: 6 }}
        animate={{ width: [6, 64, 6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  ),

  speaking: (b) => (
    <>
      <Blink n={b}>
        <PillEyes />
      </Blink>
      <motion.ellipse
        cx={110}
        cy={126}
        rx={8}
        fill={GLOW}
        initial={{ ry: 3 }}
        animate={{ ry: [2, 7, 3, 6, 2] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      />
    </>
  ),

  happy: () => (
    <>
      <HappyEyes />
      <path d="M99 120 Q110 133 121 120" {...LINE} />
      <Blush />
    </>
  ),

  excited: () => (
    <>
      <path className="part spin-slow" d={star(LX, EY, 11)} fill={GLOW} />
      <path className="part spin-slow" d={star(RX, EY, 11)} fill={GLOW} />
      <path d="M100 119 L120 119 Q120 133 110 133 Q100 133 100 119Z" fill={GLOW} />
      <Blush />
    </>
  ),

  confused: () => (
    <>
      <circle cx={LX} cy={EY} r={8} fill={GLOW} />
      <path d={`M${RX - 8} ${EY} L${RX + 8} ${EY - 3}`} {...LINE} />
      <path d="M99 127 Q104 122 109 127 T119 127" {...LINE} />
    </>
  ),

  sad: () => (
    <>
      <path d={`M${LX - 9} ${EY - 2} Q${LX} ${EY + 8} ${LX + 9} ${EY - 2}`} {...LINE} />
      <path d={`M${RX - 9} ${EY - 2} Q${RX} ${EY + 8} ${RX + 9} ${EY - 2}`} {...LINE} />
      <path d={`M${LX - 9} ${EY - 12} L${LX + 7} ${EY - 16}`} {...LINE} strokeWidth={3.5} />
      <path d={`M${RX + 9} ${EY - 12} L${RX - 7} ${EY - 16}`} {...LINE} strokeWidth={3.5} />
      <path d="M102 130 Q110 123 118 130" {...LINE} />
    </>
  ),

  sleepy: () => (
    <>
      <path d={`M${LX - 8} ${EY + 2} Q${LX} ${EY + 7} ${LX + 8} ${EY + 2}`} {...LINE} />
      <path d={`M${RX - 8} ${EY + 2} Q${RX} ${EY + 7} ${RX + 8} ${EY + 2}`} {...LINE} />
      <circle cx={110} cy={127} r={3} fill={GLOW} />
    </>
  ),

  celebrating: () => (
    <>
      <HappyEyes />
      <path d="M98 117 L122 117 Q122 135 110 135 Q98 135 98 117Z" fill={GLOW} />
      <Blush />
    </>
  ),

  focus: (b) => (
    <>
      <Blink n={b}>
        <PillEyes h={12} />
      </Blink>
      {/* tiny round glasses: MyAgent "puts them on" for focus sessions */}
      <circle cx={LX} cy={EY} r={13} stroke={GLOW} strokeWidth={3} fill="none" />
      <circle cx={RX} cy={EY} r={13} stroke={GLOW} strokeWidth={3} fill="none" />
      <path d={`M${LX + 13} ${EY} Q110 ${EY - 5} ${RX - 13} ${EY}`} stroke={GLOW} strokeWidth={3} fill="none" />
      <path d="M104 127 L116 127" {...LINE} />
    </>
  ),
  yawn: () => (
    <>
      <path d={`M${LX - 8} ${EY} Q${LX} ${EY + 5} ${LX + 8} ${EY}`} {...LINE} />
      <path d={`M${RX - 8} ${EY} Q${RX} ${EY + 5} ${RX + 8} ${EY}`} {...LINE} />
      <ellipse cx={110} cy={127} rx={8} ry={10} fill={GLOW} />
    </>
  ),

  surprised: () => (
    <>
      <circle cx={LX} cy={EY} r={10} {...LINE} strokeWidth={4} />
      <circle cx={RX} cy={EY} r={10} {...LINE} strokeWidth={4} />
      <circle cx={LX} cy={EY} r={3.5} fill={GLOW} />
      <circle cx={RX} cy={EY} r={3.5} fill={GLOW} />
      <ellipse cx={110} cy={130} rx={5} ry={6} {...LINE} strokeWidth={4} />
    </>
  ),

  humming: () => (
    <>
      <HappyEyes />
      <path d="M104 126 Q110 122 116 126" {...LINE} />
      <Blush />
    </>
  ),
};
