# MIMO event contract

The UI and the agent talk over one WebSocket: `ws://127.0.0.1:8765/ws`.
Every message is JSON: `{ "type": string, "payload": object }`.

**The rule:** the UI only *displays* state and *sends commands*. It never touches
the computer. Everything that acts (files, browser, apps, timers) lives in the agent.

TypeScript types: `app/src/lib/events.ts` · Python: `agent/mimo_agent/events.py`.
Keep the three in sync when adding an event.

---

## Agent → UI (events)

| type | payload | when |
|---|---|---|
| `hello` | `{ version, features: { timer, router, voice, tts, llm, vision, computer } }` | on connect; `features` says honestly what works right now (e.g. `llm` is false if Ollama isn't running) |
| `agent.status` | `{ state, detail? }` | state = `idle` `listening` `thinking` `working` `speaking` `waiting_confirmation` `error` |
| `agent.transcript` | `{ text, final }` | what the user said or typed |
| `agent.message` | `{ text, tone? }` | something MIMO says; tone = `neutral` `happy` `confused` `sad` |
| `agent.plan` | `{ task_id, goal, steps: [] }` | the LLM started a task; steps arrive one by one |
| `agent.step` | `{ task_id, step_id, title, status, note? }` | status = `running` `done` `failed` `skipped`; unknown `step_id` = new step |
| `agent.confirm` | `{ request_id, action, details }` | MIMO needs permission before a risky action |
| `agent.confirm_closed` | `{ request_id }` | the question was answered or timed out (60 s → "no") |
| `agent.done` | `{ task_id, ok, summary }` | task finished |
| `timer.state` | `{ timer: Timer \| null }` | any timer change (start, pause, resume, stop, phase change) |
| `timer.done` | `{ kind, label, next_kind? }` | a timer/phase finished |
| `stats` | `{ focus_minutes_today, sessions_today, coins }` | on connect and after a focus session |
| `agent.wake` | `{}` | MIMO heard “Hey MIMO” |
| `prefs` | `{ wake_word, speak_replies }` | on connect and after a change |
| `game.open` | `{ game }` | open a game on MIMO's stage: `tictactoe` `rps` `memory` |
| `music.playing` | `{ title, query }` | a song was opened on YouTube (MIMO dances for a bit) |
| `error` | `{ message }` | a command failed |

`Timer`:
```json
{
  "id": "a1b2", "kind": "focus | short_break | long_break | timer",
  "label": "Focus", "duration_s": 1500, "remaining_s": 1320,
  "status": "running | paused", "ends_at": 1730340000000,
  "cycle": 2, "cycles_before_long": 4
}
```
The agent does **not** send a tick every second. The UI counts down locally from
`ends_at` (wall clock, ms) while running, and shows `remaining_s` while paused.

## UI → Agent (commands)

`{ "type": "cmd", "payload": { "name": string, "args": object } }`

| name | args |
|---|---|
| `say` | `{ text }`: a typed or transcribed request; goes through the router |
| `timer.start` | `{ minutes, label? }` |
| `pomodoro.start` | `{ focus_min?, short_min?, long_min? }` (defaults 25 / 5 / 15) |
| `timer.pause` · `timer.resume` · `timer.stop` · `timer.skip` | `{}` |
| `voice.start` · `voice.stop` | `{}`: start listening; recording stops by itself when you stop talking (`voice.stop` = stop now) |
| `voice.hush` | `{}`: stop speaking |
| `prefs.set` | `{ key, value }`: `wake_word` or `speak_replies` (booleans), saved in `agent/data/prefs.json` |
| `game.result` | `{ game, outcome }`: outcome from the user's side, `win` `lose` `draw`; wins/draws earn coins |
| `confirm.reply` | `{ request_id, approved }` |
| `agent.cancel` | `{}`: stop the current task (also: saying "stop") |

## Character beats (UI only)

Besides moods, MIMO plays one-shot "beats" (wave, hop, nod, shake, spin, yawn,
stretch, giggle, startle, hum). They come from events (e.g. `timer.done` → spin,
`agent.confirm` → shake), clicks (poke) and idle life (`app/src/lib/life.ts`).
They never reach the agent.

## How the UI picks MIMO's mood

See `app/src/lib/store.ts → moodFor()`. Moods come only from these events:
agent status first (listening / thinking / working / speaking / confirmation),
then short reactions (`timer.done` → celebrating, `agent.done` → happy or sad,
confused message → confused), then focus timer → focus, then idle → sleepy after
a few quiet minutes.
