import { create } from "zustand";
import { BEAT_MS, type Beat, type BeatCue, type Mood } from "../character";
import { agent } from "./agent";
import type { AgentEvent, AgentState, Features, GameId, PlanStep, Prefs, StepStatus, Stats, Timer, Tone } from "./events";
import { sfx } from "./sfx";
import { greetingFor, pick, type Situation } from "./personality";

export type ChatLine = { id: number; from: "you" | "myagent"; text: string; tone?: Tone };
export type Task = {
  id: string;
  goal: string;
  steps: (PlanStep & { status: StepStatus; note?: string | null })[];
  result?: { ok: boolean; summary: string };
};
type Reaction = { mood: Mood; until: number };

type State = {
  connected: boolean;
  features: Features | null;
  agentState: AgentState;
  timer: Timer | null;
  stats: Stats;
  chat: ChatLine[];
  task: Task | null;
  bubble: { text: string; id: number } | null;
  reaction: Reaction | null;
  beat: BeatCue | null;
  confirm: { request_id: string; action: string; details: string } | null;
  game: GameId | null;
  prefs: Prefs | null;
  music: { title: string; until: number } | null;
  lastActivity: number;
  now: number;
  error: string | null;
};

const QUIET_BEFORE_SLEEPY_MS = 4 * 60 * 1000;
let lineId = 0;

export const useMyAgent = create<State>(() => ({
  connected: false,
  features: null,
  agentState: "idle",
  timer: null,
  stats: { focus_minutes_today: 0, sessions_today: 0, coins: 0 },
  chat: [],
  task: null,
  bubble: null,
  reaction: null,
  beat: null,
  confirm: null,
  game: null,
  prefs: null,
  music: null,
  lastActivity: Date.now(),
  now: Date.now(),
  error: null,
}));

const set = useMyAgent.setState;
const react = (mood: Mood, ms = 3500) => set({ reaction: { mood, until: Date.now() + ms } });
const say = (text: string) => set({ bubble: { text, id: ++lineId } });
const touch = () => set({ lastActivity: Date.now() });
const line = (situation: Situation) => say(pick(situation));

let beatId = 0;
let beatTimer: ReturnType<typeof setTimeout> | undefined;
/** Play a one-shot action. It clears itself when it's done. */
export function playBeat(name: Beat) {
  const id = ++beatId;
  set({ beat: { name, id } });
  clearTimeout(beatTimer);
  beatTimer = setTimeout(() => {
    if (useMyAgent.getState().beat?.id === id) set({ beat: null });
  }, BEAT_MS[name]);
}
const addLine = (line: Omit<ChatLine, "id">) =>
  set((s) => ({ chat: [...s.chat, { ...line, id: ++lineId }].slice(-50) }));

function apply(e: AgentEvent) {
  switch (e.type) {
    case "hello":
      set({ features: e.payload.features });
      break;
    case "agent.status": {
      const was = useMyAgent.getState().agentState;
      set({ agentState: e.payload.state });
      if (e.payload.state === "listening" && was !== "listening") sfx.play("listen");
      touch();
      break;
    }
    case "agent.wake":
      // He heard his name: perk up!
      playBeat("startle");
      react("excited", 1200);
      touch();
      break;
    case "prefs":
      set({ prefs: e.payload });
      break;
    case "agent.transcript":
      if (e.payload.final) addLine({ from: "you", text: e.payload.text });
      touch();
      break;
    case "agent.message": {
      const { text, tone } = e.payload;
      addLine({ from: "myagent", text, tone });
      say(text);
      if (tone === "happy") (react("happy"), playBeat("nod"));
      if (tone === "confused") (react("confused"), playBeat("shake"));
      if (tone === "sad") react("sad");
      touch();
      break;
    }
    case "agent.plan":
      set({
        task: {
          id: e.payload.task_id,
          goal: e.payload.goal,
          steps: e.payload.steps.map((st) => ({ ...st, status: "pending" as StepStatus })),
        },
      });
      break;
    case "agent.step": {
      // Steps arrive one by one as the LLM decides them: update or append.
      const { task_id, step_id, title, status, note } = e.payload;
      set((s) => {
        if (!s.task || s.task.id !== task_id) return {};
        const exists = s.task.steps.some((st) => st.id === step_id);
        const steps = exists
          ? s.task.steps.map((st) => (st.id === step_id ? { ...st, title, status, note } : st))
          : [...s.task.steps, { id: step_id, title, status, note }];
        return { task: { ...s.task, steps } };
      });
      touch();
      break;
    }
    case "agent.confirm":
      set({ confirm: e.payload });
      playBeat("shake");
      break;
    case "agent.confirm_closed":
      set((s) => (s.confirm?.request_id === e.payload.request_id ? { confirm: null } : {}));
      break;
    case "agent.done":
      set((s) => (s.task ? { task: { ...s.task, result: { ok: e.payload.ok, summary: e.payload.summary } } } : {}));
      react(e.payload.ok ? "happy" : "sad", 4000);
      if (e.payload.ok) playBeat("hop");
      break;
    case "timer.state": {
      const prev = useMyAgent.getState().timer;
      const next = e.payload.timer;
      set({ timer: next });
      // a new focus phase just started (not a pause/resume of the same one)
      if (next?.kind === "focus" && next.id !== prev?.id && next.status === "running") playBeat("nod");
      touch();
      break;
    }
    case "timer.done": {
      const { kind, next_kind } = e.payload;
      if (kind === "focus") {
        react("celebrating", 5000);
        playBeat("spin");
        line(next_kind === "long_break" ? "longBreak" : "focusDone");
      } else if (kind === "timer") {
        react("excited", 4000);
        playBeat("hop");
        line("timerDone");
      } else {
        react("happy", 3000);
        playBeat("stretch");
        line("breakOver");
      }
      sfx.play("chime");
      touch();
      break;
    }
    case "stats":
      set({ stats: e.payload });
      break;
    case "game.open":
      openGame(e.payload.game);
      break;
    case "music.playing":
      set({ music: { title: e.payload.title, until: Date.now() + 90_000 } });
      playBeat("hum");
      react("excited", 2500);
      touch();
      break;
    case "error":
      set({ error: e.payload.message });
      react("confused");
      break;
  }
}

/** The one place that decides how MyAgent looks. Real events only. */
export function moodFor(s: State): Mood {
  if (!s.connected) return "sleepy";
  switch (s.agentState) {
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "working":
      return "working";
    case "speaking":
      return "speaking";
    case "waiting_confirmation":
      return "confused";
    case "error":
      return "sad";
  }
  if (s.reaction && s.reaction.until > s.now) return s.reaction.mood;
  if (s.music && s.music.until > s.now) return "happy";
  if (s.timer?.kind === "focus" && s.timer.status === "running") return "focus";
  if (s.timer && s.timer.kind !== "focus" && s.timer.status === "running") return "happy";
  if (s.now - s.lastActivity > QUIET_BEFORE_SLEEPY_MS) return "sleepy";
  return "idle";
}

export const useMood = () => useMyAgent(moodFor);

/** Seconds left on the current timer, counted locally from ends_at. */
export function secondsLeft(t: Timer | null, now: number): number {
  if (!t) return 0;
  if (t.status === "paused" || t.ends_at == null) return t.remaining_s;
  return Math.max(0, Math.round((t.ends_at - now) / 1000));
}

export const send = agent.send.bind(agent);

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  send("prefs.set", { key, value });
}

/** Esc / stop: stop talking, stop listening, cancel the task. */
export function hush() {
  const s = useMyAgent.getState();
  if (s.agentState === "listening") send("voice.stop");
  else send("agent.cancel");
}

export function answerConfirm(approved: boolean) {
  const c = useMyAgent.getState().confirm;
  if (!c) return;
  send("confirm.reply", { request_id: c.request_id, approved });
  set({ confirm: null });
}

export function sayToMyAgent(text: string) {
  const ok = send("say", { text });
  if (!ok) say("I can't hear you: my agent isn't running yet.");
  touch();
  return ok;
}

// ---------- games ----------

export function openGame(game: GameId) {
  set({ game });
  playBeat("hop");
  react("excited", 1500);
  touch();
}

export function closeGame() {
  set({ game: null });
  touch();
}

export type Outcome = "win" | "lose" | "draw";

/** A game ended. outcome is from the USER's side. MyAgent reacts; the agent pays coins. */
export function gameOver(game: GameId, outcome: Outcome) {
  send("game.result", { game, outcome });
  sfx.play(outcome === "win" ? "win" : outcome === "lose" ? "lose" : "draw");
  if (outcome === "win") {
    react("sad", 2200);
    playBeat("shake");
    line(game === "memory" ? "memoryDone" : "youWin");
    if (game === "memory") (react("celebrating", 3000), playBeat("spin"));
  } else if (outcome === "lose") {
    react("celebrating", 3000);
    playBeat("spin");
    line("myAgentWins");
  } else {
    react("happy", 2000);
    playBeat("nod");
    line("draw");
  }
  touch();
}

/** Small reactions during a game. */
export function gameMoment(kind: "thinking" | "nice") {
  if (kind === "thinking") {
    react("thinking", 900);
    if (Math.random() < 0.35) line("myAgentTurn");
  } else {
    react("happy", 900);
    playBeat("nod");
    sfx.play("nice");
    if (Math.random() < 0.4) line("memoryMatch");
  }
  touch();
}

// ---------- direct interaction ----------

let pokes: number[] = [];
/** The user clicked MyAgent. */
export function poke() {
  const s = useMyAgent.getState();
  // Clicking MyAgent while he talks makes him stop: the quickest "shh".
  if (s.agentState === "speaking") {
    send("voice.hush");
    playBeat("nod");
    touch();
    return;
  }
  sfx.play("poke");
  const now = Date.now();
  pokes = [...pokes.filter((t) => now - t < 5000), now];
  if (!s.connected) {
    playBeat("shake");
    line("offline");
  } else if (moodFor(s) === "sleepy") {
    playBeat("startle");
    line("wokenUp");
  } else if (pokes.length >= 5) {
    playBeat("shake");
    react("confused", 2000);
    line("pokeMany");
    pokes = [];
  } else {
    const beats: Beat[] = ["giggle", "hop", "spin", "giggle"];
    playBeat(beats[Math.floor(Math.random() * beats.length)]);
    react("happy", 1800);
    if (Math.random() < 0.6) line("poke");
  }
  touch();
}

/** Say hello (on connect / when the user comes back). */
export function greet(situation: Situation = greetingFor(new Date().getHours())) {
  playBeat("wave");
  line(situation);
  touch();
}

export { line as speakLine };

let booted = false;
/** Connect once per window and keep the clock ticking for countdowns. */
export function bootMyAgent() {
  if (booted) return;
  booted = true;
  agent.onEvent(apply);
  let greeted = false;
  agent.onConnection((connected) => {
    set({ connected, ...(connected ? {} : { agentState: "idle" as AgentState }) });
    if (connected && !greeted) {
      greeted = true;
      setTimeout(() => greet(), 600);
    }
  });
  agent.start();
  setInterval(() => set({ now: Date.now() }), 500);
}

