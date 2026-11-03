# MyAgent

Your little AI computer companion: a voice-driven computer-use agent that
lives on your desktop as an animated character. Everything runs locally.

```
MIMO/
├── app/     Electron + React + TypeScript: everything you see
├── agent/   Python + FastAPI: the brain, the only part allowed to act
└── docs/    events.md, the contract between the two
```

## Run it (Windows)

You need **Node 20+** and **Python 3.11+**.

**1. Agent (first time only)**
```powershell
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```
Once `agent\.venv` exists, the app starts the agent by itself, so next time you
can skip straight to step 2.

**2. Brain (Ollama)**
```powershell
ollama pull qwen2.5:3b
```
With 8 GB of GPU memory you can use the smarter `qwen2.5:7b`. Set `MIMO_MODEL=qwen2.5:7b`
before `python run.py`. The model unloads after 2 idle minutes to keep your PC cool.

**3. Voice (optional)**
```powershell
cd agent
pip install -r requirements-voice.txt
python -m piper.download_voices en_US-amy-medium --download-dir voices
```
Whisper downloads its model (~150 MB) the first time you talk.

**4. App**
```powershell
cd app
npm install
npm run dev
```
Two windows open: the main MIMO window and the small floating MIMO.

## Using it

- **Talk:** just say **“Hey MIMO”** (he perks up and listens), or **“Hey MIMO, play lofi”** in one go.
  You can also press the mic, or **Ctrl+Shift+Space** from any app. He stops recording when you stop
  talking, answers out loud, then listens for your reply. Silence for a few seconds (or typing) ends it.
- **Stop:** **Esc**, click MIMO while he talks, or say "stop".
- **Settings:** Talk tab → *Voice and sound*: wake word, spoken replies, sound effects.
- **Play:** "let's play tic-tac-toe", "rock paper scissors", "memory game", or the **Play** tab. Wins earn coins.
- **Music:** "play lofi hip hop" opens the first YouTube result, already playing, in your browser.
- **Chat:** "Hey MIMO!", "tell me a joke", questions… (needs Ollama).
- Say or type "stop" (or press the stop button) to cancel.
- Click MIMO: it reacts. Leave it alone long enough and it falls asleep.
- Floating MIMO: drag it anywhere, double-click to open the main window, right-click for the menu.
- Closing the main window hides it. MIMO keeps floating. Quit from the right-click menu.

## Status

| Part | State |
|---|---|
| Character: 12 moods, 10 one-shot actions, blinking, eye tracking, idle life, personality | ✅ |
| Main window: Home, Talk, Focus | ✅ |
| Floating companion | ✅ |
| Timers and Pomodoro (agent side, saved in SQLite, coins) | ✅ |
| Fast command router for simple requests | ✅ |
| Brain: Ollama tool-calling loop, live steps, cancel | ✅ (tested with a stand-in model) |
| Computer access: web search, open websites, play YouTube. **Nothing else.** | ✅ |
| Games: tic-tac-toe, rock-paper-scissors, memory match, with MIMO reacting | ✅ |
| Voice: “Hey MIMO” wake word, auto end-of-speech, spoken replies, conversation mode | ✅ |
| Sound effects, keyboard shortcuts, voice settings | ✅ |
| Reminders and to-do list | next |

The app shows the same list under **Talk → What MIMO can do**. It reads it from
the agent, so it is always honest about what works.

## Useful commands

| Where | Command | What it does |
|---|---|---|
| app | `npm run dev` | run the desktop app with live reload |
| app | `npm run web` | run the UI in a browser only (no floating window) |
| app | `npm run build` then `npm start` | run the production build |
| agent | `python -m pytest` | run the agent tests |

Dev pages: open `http://localhost:5173/?view=gallery` while `npm run dev`
is running to see every mood side by side.

## Settings (environment variables)

| Variable | Default | |
|---|---|---|
| `MIMO_MODEL` | `qwen2.5:3b` | Ollama model |
| `MIMO_USER_NAME` | `Aya` | what MIMO calls you |
| `MIMO_KEEP_ALIVE` | `2m` | how long the model stays loaded when idle |
| `MIMO_WHISPER_MODEL` | `base.en` | `small.en` is more accurate, slower |
| `MIMO_PIPER_VOICE` | `en_US-amy-medium` | any Piper voice in `agent/voices` |
| `MIMO_WAKE_MODEL` | `tiny.en` | model that listens for “Hey MIMO” (tiny = light on the CPU) |
| `MIMO_MIC_THRESHOLD` | `0.012` | raise it (e.g. `0.02`) if background noise triggers him; lower if he misses you |

Every action MIMO takes is logged in `agent/data/actions.log`.

## What MIMO is allowed to do

MIMO's only tools are: play YouTube, search the web, open a website, start a game,
start a timer. There are **no** file, folder, app or system tools in the code at all,
so even if the language model asks for one, nothing can happen. Websites must be
normal `http(s)` addresses; local addresses and `file://` links are refused.

## Changing MIMO's design

The character lives in `app/src/character/`. A skin only draws: it receives
`mood`, `beat`, `gaze`, `blink` and renders them (see `types.ts`).

- `skins/critter/`: the current MIMO (big ears, glossy eyes, cable tail with a glowing plug)
- `skins/mimo/`: the first pocket-computer design, kept as an alternative

To switch or add a design, change one line in `character/index.ts`. Nothing else changes.
His room (lofi desk, day / focus night / golden-hour break) is `app/src/components/Room.tsx`.

## Design rules

1. **MIMO cannot touch files or settings.** Web, YouTube, games and timers only.
2. **The UI never touches the computer.** It displays state and sends commands.
   Only the agent acts, through its tools and safety layer.
3. **MIMO's mood comes from real events only.** See `moodFor()` in `app/src/lib/store.ts`.
4. **No fake features.** Anything not built is labeled "coming soon" in the app.
5. **Gentle on the PC.** Animations are CSS/SVG, the timer doesn't tick the
   agent every second, and models will load on demand, one at a time.
