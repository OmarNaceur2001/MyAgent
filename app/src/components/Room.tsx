// MyAgent's home: a cozy lofi desk inside your computer.
// Three moods of light, driven by the timer:
//   day    → pink walls, sunset sky
//   night  → focus sessions: purple dark, lamp on, stars out
//   break  → golden hour
// Pure SVG + a few CSS animations (clouds, lights, steam). Cheap to draw.

import "./room.css";

export type Scene = "day" | "night" | "break";

type Palette = {
  wall: string;
  stripe: string;
  sky: [string, string, string];
  sun: string;
  desk: string;
  deskFront: string;
  deskEdge: string;
  rug: string; // MyAgent's mousepad
  lights: number; // string-light glow strength
  lamp: number;
};

export const PALETTE: Record<Scene, Palette> = {
  day: {
    wall: "#F7C8D6",
    stripe: "#F2BACB",
    sky: ["#9FB2FF", "#D9A8F0", "#FFB9A6"],
    sun: "#FFE3A3",
    desk: "#F6C2A8",
    deskFront: "#E9A58C",
    deskEdge: "#FBD6C2",
    rug: "#ADBDA5",
    lights: 0.25,
    lamp: 0,
  },
  night: {
    wall: "#3B2C66",
    stripe: "#35285D",
    sky: ["#16133A", "#2E2563", "#5B3F8C"],
    sun: "#F1DCA8",
    desk: "#6B4C8F",
    deskFront: "#553A78",
    deskEdge: "#82619F",
    rug: "#2A2350",
    lights: 0.9,
    lamp: 1,
  },
  break: {
    wall: "#FBD2BC",
    stripe: "#F7C4AA",
    sky: ["#FFC98A", "#FFAF95", "#FF8FA0"],
    sun: "#FFF0B0",
    desk: "#F4B896",
    deskFront: "#E39A7D",
    deskEdge: "#FBD0B6",
    rug: "#A9BA9D",
    lights: 0.45,
    lamp: 0,
  },
};

const INK = "#332B24";
const S = { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export function Room({ scene, clock }: { scene: Scene; clock: string }) {
  const p = PALETTE[scene];
  const night = scene === "night";
  const t = { transition: "fill .9s" };
  return (
    <svg className="room" viewBox="0 0 800 600" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset=".6" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <radialGradient id="room-lamp">
          <stop offset="0" stopColor="#E6BD78" stopOpacity=".55" />
          <stop offset="1" stopColor="#E6BD78" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="room-bulb">
          <stop offset="0" stopColor="#F2D99D" stopOpacity="1" />
          <stop offset="1" stopColor="#F2D99D" stopOpacity="0" />
        </radialGradient>
        <clipPath id="room-window">
          <rect x="104" y="64" width="232" height="232" rx="30" />
        </clipPath>
      </defs>

      {/* wall */}
      <rect width="800" height="600" fill={p.wall} style={t} />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 84 + 10} y="0" width="34" height="440" fill={p.stripe} style={t} />
      ))}

      {/* window onto the sky */}
      <g clipPath="url(#room-window)">
        <rect x="104" y="64" width="232" height="232" fill="url(#room-sky)" />
        {night ? (
          <>
            <path d="M282 108 a26 26 0 1 0 20 42 a22 22 0 1 1 -20 -42z" fill={p.sun} />
            {[
              [140, 100], [190, 140], [230, 92], [150, 200], [260, 210], [310, 180], [200, 250],
            ].map(([x, y], i) => (
              <circle key={i} className="room-star" style={{ animationDelay: `${i * 0.5}s` }} cx={x} cy={y} r={i % 3 ? 2.2 : 3.4} fill="#F1DCA8" />
            ))}
          </>
        ) : (
          <>
            <circle cx="270" cy={scene === "break" ? 262 : 240} r={scene === "break" ? 46 : 36} fill={p.sun} opacity=".95" />
            <g className="room-clouds">
              <Cloud x={120} y={130} s={1.1} />
              <Cloud x={250} y={96} s={0.8} />
              <Cloud x={380} y={150} s={1} />
              <Cloud x={-20} y={170} s={0.9} />
            </g>
          </>
        )}
      </g>
      <rect x="104" y="64" width="232" height="232" rx="30" fill="none" {...S} />
      <path d="M220 64 V296 M104 180 H336" {...S} />
      <rect x="90" y="290" width="260" height="20" rx="10" fill="#FCF8F1" {...S} />

      {/* sticky notes */}
      <g transform="translate(600 100) rotate(-6)">
        <rect width="54" height="54" rx="4" fill="#F0D398" {...S} strokeWidth={4} />
        <path d="M12 20 H42 M12 32 H34" stroke={INK} strokeWidth="3" strokeLinecap="round" opacity=".5" />
      </g>
      <g transform="translate(664 132) rotate(8)">
        <rect width="48" height="48" rx="4" fill="#A9BA9D" {...S} strokeWidth={4} />
        <path d="M24 14 C 16 4, 4 16, 24 32 C 44 16, 32 4, 24 14Z" fill="#D6A6A0" stroke={INK} strokeWidth="3" />
      </g>
      <g transform="translate(612 172) rotate(3)">
        <rect width="50" height="44" rx="4" fill="#D7C7A8" {...S} strokeWidth={4} />
        <path d="M10 16 l6 6 l12 -12" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* string lights */}
      <path d="M40 30 Q 400 120 760 30" fill="none" stroke={INK} strokeWidth="3" />
      {Array.from({ length: 13 }, (_, i) => {
        const tt = (i + 1) / 14;
        const x = (1 - tt) ** 2 * 40 + 2 * (1 - tt) * tt * 400 + tt ** 2 * 760;
        const y = (1 - tt) ** 2 * 30 + 2 * (1 - tt) * tt * 120 + tt ** 2 * 30;
        const c = ["#E6BD78", "#D6A6A0", "#A9BA9D", "#D7C7A8"][i % 4];
        return (
          <g key={i}>
            <circle className="room-bulb" style={{ animationDelay: `${(i % 5) * 0.4}s` }} cx={x} cy={y + 14} r="16" fill="url(#room-bulb)" opacity={p.lights} />
            <rect x={x - 5} y={y + 4} width="10" height="15" rx="5" fill={c} stroke={INK} strokeWidth="2.5" />
          </g>
        );
      })}

      {/* lamp glow (night) */}
      <ellipse cx="230" cy="380" rx="260" ry="200" fill="url(#room-lamp)" opacity={p.lamp} style={{ transition: "opacity .9s" }} />

      {/* desk */}
      <rect x="0" y="440" width="800" height="22" fill={p.desk} style={t} />
      <rect x="0" y="440" width="800" height="6" fill={p.deskEdge} style={t} />
      <rect x="0" y="462" width="800" height="138" fill={p.deskFront} style={t} />
      <path d="M0 440 H800 M0 462 H800" stroke={INK} strokeWidth="5" />

      {/* plant in an upside-down keycap */}
      <g transform="translate(122 372) scale(.92)">
        <path d="M36 0 C 10 -36, 22 -78, 46 -84 C 50 -54, 46 -24, 36 0Z" fill="#8FAE8D" {...S} strokeWidth={4} />
        <path d="M38 0 C 52 -34, 86 -56, 104 -46 C 92 -22, 66 -6, 38 0Z" fill="#85A582" {...S} strokeWidth={4} />
        <path d="M34 0 C 16 -18, -14 -22, -20 -8 C -2 2, 16 4, 34 0Z" fill="#A0B99A" {...S} strokeWidth={4} />
        <path d="M2 0 H74 L66 80 H10Z" fill="#D6A6A0" {...S} />
        <rect x="14" y="12" width="48" height="24" rx="6" fill="#fff" opacity=".45" />
      </g>

      {/* USB lamp */}
      <g transform="translate(218 300)">
        <path d="M26 140 C 26 90, 10 60, 40 30" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
        <path d="M26 140 C 26 90, 10 60, 40 30" fill="none" stroke="#ADBDA5" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M18 34 C 20 8, 66 4, 72 28Z" fill="#E6BD78" {...S} strokeWidth={4} transform="rotate(14 45 22)" />
        <ellipse cx="50" cy="38" rx="14" ry="4" fill="#F1DCA8" opacity={0.4 + p.lamp * 0.6} />
        <rect x="10" y="132" width="32" height="12" rx="4" fill="#BCA98E" {...S} strokeWidth={4} />
      </g>

      {/* floppy-disk bed with a sock blanket */}
      <g transform="translate(250 404)">
        <rect x="0" y="0" width="110" height="36" rx="7" fill="#7B8A89" {...S} strokeWidth={4} />
        <rect x="26" y="4" width="48" height="14" rx="3" fill="#E3DED2" stroke={INK} strokeWidth="3" />
        <ellipse cx="20" cy="-2" rx="16" ry="9" fill="#FCF8F1" stroke={INK} strokeWidth="3.5" />
        <path d="M34 -6 C 58 -12, 92 -12, 108 -4 L 106 14 L 36 14Z" fill="#C98A69" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M44 0 H100 M44 7 H100" stroke="#FFD2C8" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* mug */}
      <g transform="translate(470 402)">
        <path d="M0 0 H34 V30 C 34 40, 0 40, 0 30Z" fill="#A9BA9D" {...S} strokeWidth={4} />
        <path d="M34 8 C 46 8, 46 24, 34 24" fill="none" {...S} strokeWidth={4} />
        <path className="room-steam" d="M10 -8 C 4 -16, 14 -20, 8 -30" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
        <path className="room-steam" style={{ animationDelay: "1s" }} d="M24 -8 C 18 -16, 28 -20, 22 -30" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* MyAgent's retro monitor */}
      <g transform="translate(526 318) scale(.8)">
        <rect x="-4" y="4" width="196" height="150" rx="26" fill="#A792E0" {...S} />
        <rect x="0" y="0" width="188" height="146" rx="24" fill="#ADBDA5" {...S} />
        <rect x="18" y="16" width="152" height="104" rx="16" fill="#2A2350" stroke={INK} strokeWidth="4" />
        <rect x="18" y="16" width="152" height="104" rx="16" fill="url(#room-sky)" opacity=".12" />
        <text x="94" y="70" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="600" fontSize="38" fill="#A9BA9D" className="room-clock">
          {clock}
        </text>
        <path d="M84 92 h6 v-6 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6z" fill="#D6A6A0" />
        <circle cx="160" cy="132" r="5" fill="#A9BA9D" stroke={INK} strokeWidth="2.5" />
        <rect x="30" y="128" width="40" height="7" rx="3.5" fill="#A792E0" />
        <rect x="70" y="146" width="48" height="12" fill="#A792E0" {...S} strokeWidth={4} />
      </g>

      {/* keyboard */}
      <g transform="translate(484 452) scale(.82)">
        <path d="M0 0 H250 L262 26 H-12Z" fill="#FCF8F1" {...S} strokeWidth={4} />
        {Array.from({ length: 2 }, (_, r) =>
          Array.from({ length: 10 }, (_, c) => (
            <rect key={`${r}-${c}`} x={8 + c * 24 - r * 4} y={4 + r * 10} width="18" height="7" rx="2" fill={(r + c) % 7 === 3 ? "#D6A6A0" : "#E9DDF5"} />
          )),
        )}
      </g>
    </svg>
  );
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 20 C -2 6, 16 0, 24 8 C 30 -6, 54 -4, 56 10 C 70 8, 76 24, 64 28 H6 C -4 28, -4 22, 0 20Z" fill="#fff" opacity=".92" />
    </g>
  );
}
