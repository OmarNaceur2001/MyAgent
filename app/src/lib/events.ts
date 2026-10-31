// Event contract between the agent and the UI.
// Source of truth: docs/events.md (mirrored in agent/mimo_agent/events.py).

export type AgentState =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "speaking"
  | "waiting_confirmation"
  | "error";

export type Tone = "neutral" | "happy" | "confused" | "sad";

export type TimerKind = "focus" | "short_break" | "long_break" | "timer";

export type Timer = {
  id: string;
  kind: TimerKind;
  label: string;
  duration_s: number;
  remaining_s: number;
  status: "running" | "paused";
  ends_at: number | null;
  cycle: number;
  cycles_before_long: number;
};

export type Features = {
  timer: boolean;
  router: boolean;
  voice: boolean;
  tts: boolean;
  wake: boolean;
  llm: boolean;
  vision: boolean;
  computer: boolean;
};

export type Stats = { focus_minutes_today: number; sessions_today: number; coins: number };

export type PlanStep = { id: string; title: string };
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type AgentEvent =
  | { type: "hello"; payload: { version: string; features: Features } }
  | { type: "agent.status"; payload: { state: AgentState; detail?: string | null } }
  | { type: "agent.transcript"; payload: { text: string; final: boolean } }
  | { type: "agent.message"; payload: { text: string; tone?: Tone } }
  | { type: "agent.plan"; payload: { task_id: string; goal: string; steps: PlanStep[] } }
  | { type: "agent.step"; payload: { task_id: string; step_id: string; title: string; status: StepStatus; note?: string | null } }
  | { type: "agent.confirm"; payload: { request_id: string; action: string; details: string } }
  | { type: "agent.confirm_closed"; payload: { request_id: string } }
  | { type: "agent.done"; payload: { task_id: string; ok: boolean; summary: string } }
  | { type: "timer.state"; payload: { timer: Timer | null } }
  | { type: "timer.done"; payload: { kind: TimerKind; label: string; next_kind?: TimerKind | null } }
  | { type: "stats"; payload: Stats }
  | { type: "game.open"; payload: { game: GameId } }
  | { type: "agent.wake"; payload: Record<string, never> }
  | { type: "prefs"; payload: Prefs }
  | { type: "music.playing"; payload: { title: string; query: string } }
  | { type: "error"; payload: { message: string } };

export type GameId = "tictactoe" | "rps" | "memory";

export type Prefs = { wake_word: boolean; speak_replies: boolean };

export type CommandName =
  | "say"
  | "timer.start"
  | "pomodoro.start"
  | "timer.pause"
  | "timer.resume"
  | "timer.stop"
  | "timer.skip"
  | "voice.start"
  | "voice.stop"
  | "voice.hush"
  | "game.result"
  | "prefs.set"
  | "confirm.reply"
  | "agent.cancel";
