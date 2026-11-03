// MyAgent's little sound effects, made in code with WebAudio: no audio files to ship.
// Soft sine/triangle tones, short and quiet, so they're cute rather than noisy.
// Muting is remembered per computer (localStorage; if storage is unavailable, sound just stays on).

type Note = { f: number; t: number; d: number; type?: OscillatorType; v?: number; slideTo?: number };

const SOUNDS: Record<string, Note[]> = {
  // poke: a bouncy "boop"
  poke: [{ f: 520, t: 0, d: 0.12, type: "sine", slideTo: 880, v: 0.16 }],
  // a game move: tiny wooden click
  tick: [{ f: 1200, t: 0, d: 0.05, type: "triangle", v: 0.08 }],
  // MyAgent starts listening: two notes up
  listen: [
    { f: 660, t: 0, d: 0.1, v: 0.12 },
    { f: 990, t: 0.09, d: 0.14, v: 0.12 },
  ],
  // you win: little rising jingle
  win: [
    { f: 523, t: 0, d: 0.12 },
    { f: 659, t: 0.1, d: 0.12 },
    { f: 784, t: 0.2, d: 0.12 },
    { f: 1047, t: 0.3, d: 0.3 },
  ],
  // MyAgent wins: smug little two-step
  lose: [
    { f: 784, t: 0, d: 0.12, type: "triangle" },
    { f: 1047, t: 0.12, d: 0.22, type: "triangle" },
  ],
  draw: [
    { f: 587, t: 0, d: 0.14 },
    { f: 587, t: 0.16, d: 0.14 },
  ],
  // a pair found / a nice moment
  nice: [
    { f: 880, t: 0, d: 0.08, v: 0.1 },
    { f: 1320, t: 0.07, d: 0.12, v: 0.1 },
  ],
  // timer done: the two-note chime
  chime: [
    { f: 659.25, t: 0, d: 0.9, v: 0.16 },
    { f: 987.77, t: 0.18, d: 0.9, v: 0.16 },
  ],
  // waking up / sleepy sigh: a slow slide down
  sleepy: [{ f: 440, t: 0, d: 0.5, type: "sine", slideTo: 260, v: 0.08 }],
};

export type Sound = keyof typeof SOUNDS;

const KEY = "myagent.sfx";
let muted = false;
try {
  muted = localStorage.getItem(KEY) === "off";
} catch {
  /* storage unavailable: keep sound on */
}

const listeners = new Set<(muted: boolean) => void>();

export const sfx = {
  get muted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem(KEY, m ? "off" : "on");
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(m));
  },
  onChange(l: (muted: boolean) => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  play(name: Sound) {
    if (muted) return;
    try {
      const ctx = audio();
      const now = ctx.currentTime + 0.01;
      for (const n of SOUNDS[name]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = n.type ?? "sine";
        o.frequency.setValueAtTime(n.f, now + n.t);
        if (n.slideTo) o.frequency.exponentialRampToValueAtTime(n.slideTo, now + n.t + n.d);
        const v = n.v ?? 0.14;
        g.gain.setValueAtTime(0, now + n.t);
        g.gain.linearRampToValueAtTime(v, now + n.t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
        o.connect(g).connect(ctx.destination);
        o.start(now + n.t);
        o.stop(now + n.t + n.d + 0.05);
      }
    } catch {
      /* no audio device: the animations still say it all */
    }
  },
};

// One shared AudioContext (creating one per sound leaks on some systems).
let ctx: AudioContext | null = null;
function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
