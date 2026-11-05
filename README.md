# MyAgent

MyAgent is a desktop AI companion with an animated character, voice interaction, a local AI agent, and a small set of computer-use tools.

The project has three main parts:

```text
MyAgent/
├── app/     Electron + React + TypeScript desktop interface
├── agent/   Python + FastAPI agent, tools, memory, and voice
└── docs/    Events and interface contracts
```

The agent, language model (through Ollama), speech recognition, and speech output can run locally. Opening websites and playing YouTube use an internet connection and your default browser.

## Requirements

- Windows 10 or 11
- Node.js 22 or newer
- Python 3.11 or newer
- [Ollama](https://ollama.com/) for AI chat and model-powered requests
- A working microphone and speakers/headphones for voice features

## First-time setup

Run the commands below in PowerShell from the repository root.

### 1. Create the Python environment

```powershell
cd agent
py -3.11 -m venv .venv

# If PowerShell blocks activation scripts, allow them for this terminal only:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned

.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
deactivate
cd ..
```

The virtual environment must stay at `agent/.venv`. The Electron app looks for Python there and starts the agent automatically when you launch the desktop app.

### 2. Install and prepare Ollama

Install Ollama, then download the default model:

```powershell
ollama pull qwen2.5:3b
```

Make sure Ollama is running before using AI chat. On a computer with enough memory, you can use the larger model:

```powershell
ollama pull qwen2.5:7b
```

To use that model, set the environment variable in the same PowerShell terminal before starting MyAgent:

```powershell
$env:MYAGENT_MODEL = "qwen2.5:7b"
```

The default model keep-alive is two minutes, which lets Ollama unload it after a period of inactivity.

### 3. Set up voice (optional)

Voice input and output are optional. Activate the agent environment and install the voice packages:

```powershell
cd agent
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-voice.txt
python -m piper.download_voices en_US-ryan-high --download-dir voices
deactivate
cd ..
```

MyAgent uses:

- **Speech recognition:** faster-whisper with the `base.en` model by default. Whisper downloads its model on first use.
- **Speech output:** Piper with the male US English voice `en_US-ryan-high`.

The microphone must be enabled in Windows under **Settings → Privacy & security → Microphone**, including **Let desktop apps access your microphone**.

### 4. Install and run the desktop app

```powershell
cd app
npm ci
npm run dev
```

The development command starts the Vite server and Electron. You should see the main MyAgent window and the small floating companion.

For later launches, once setup is complete, you can normally run:

```powershell
cd app
npm run dev
```

## Using MyAgent

### Voice and chat

- Say **“Hey MyAgent”** to activate the wake word, or say **“Hey MyAgent, play lofi”** to include a request.
- Click the microphone button to use push-to-talk.
- Press **Ctrl+Shift+Space** from another app to start listening.
- MyAgent detects when you finish speaking, responds, and can listen for a follow-up.
- Use **Esc**, the stop button, or the word **“stop”** to cancel or stop an interaction.
- Open **Talk → Voice and sound** to configure the wake word, spoken replies, and sound effects.

The default Whisper model is English-only (`base.en`). For best results, speak clearly and check that Windows is using the intended microphone.

### Website and media commands

Try direct commands such as:

- “Open Google.”
- “Go to YouTube.”
- “Visit github.com.”

You can also ask MyAgent to search the web or play a music query on YouTube. Website requests open in your default browser.

### Other features

- **Play:** start tic-tac-toe, rock-paper-scissors, or the memory game. You can also open the **Play** tab.
- **Focus:** use the Pomodoro timer and breaks.
- **Floating companion:** drag MyAgent to move him, double-click him to open the main window, or right-click for the companion menu.
- **Window behavior:** closing the main window hides it; the floating companion stays available. Use the right-click menu to quit MyAgent completely.

## Feature status

| Feature | Status |
|---|---|
| Omar character skin, moods, animations, and interactions | Available |
| Home, Talk, Play, and Focus screens | Available |
| Floating desktop companion | Available |
| Pomodoro timer and breaks | Available |
| Fast command routing for supported requests | Available |
| Ollama chat and tool-calling agent | Available when Ollama is running |
| Web search, website opening, and YouTube playback | Available |
| Tic-tac-toe, rock-paper-scissors, and memory game | Available |
| Wake word, push-to-talk, speech recognition, and spoken replies | Available after optional voice setup |
| Reminders and to-do list | Planned |

The app also shows the agent's reported capabilities under **Talk → What MyAgent can do**.

## Useful commands

Run these commands from the relevant folder:

| Folder | Command | Purpose |
|---|---|---|
| `app/` | `npm run dev` | Run the desktop app in development |
| `app/` | `npm run web` | Run the UI in a browser without the floating window |
| `app/` | `npm run typecheck` | Run the TypeScript check |
| `app/` | `npm run build` | Type-check and create the production frontend build |
| `app/` | `npm start` | Launch the Electron app using the production build |
| `agent/` | `python run.py` | Start the Python agent manually |
| `agent/` | `python -m pytest` | Run the Python tests |

To run the UI in a browser with the agent, start the agent in one PowerShell terminal:

```powershell
cd agent
.\.venv\Scripts\Activate.ps1
python run.py
```

Then, in another terminal:

```powershell
cd app
npm run web
```

While the development app is running, open [http://localhost:5173/?view=gallery](http://localhost:5173/?view=gallery) to view the character mood gallery.

## Configuration

These environment variables can be set before launching MyAgent:

| Variable | Default | Description |
|---|---|---|
| `MYAGENT_MODEL` | `qwen2.5:3b` | Ollama model used by the agent |
| `MYAGENT_USER_NAME` | `Omar` | Name MyAgent uses when addressing you |
| `MYAGENT_KEEP_ALIVE` | `2m` | How long Ollama keeps the model loaded while idle |
| `MYAGENT_WHISPER_MODEL` | `base.en` | Speech-recognition model; `small.en` is more accurate but slower |
| `MYAGENT_PIPER_VOICE` | `en_US-ryan-high` | Piper text-to-speech voice |
| `MYAGENT_WAKE_MODEL` | `tiny.en` | Lightweight Whisper model used for wake-word detection |
| `MYAGENT_MIC_THRESHOLD` | `0.012` | Microphone loudness threshold; raise it to reduce noise triggers or lower it if speech is missed |
| `MYAGENT_DEV` | `0` | Set to `1` to load the Vite development server in Electron |
| `MYAGENT_PYTHON` | Auto-detected | Optional path to the Python interpreter used by Electron |

Legacy `MIMO_*` environment variable names are still accepted as fallbacks. A `MYAGENT_*` value takes precedence when both are set.

Agent action history is written to `agent/data/actions.log`. Local application data, such as preferences and the SQLite database, is stored under `agent/data/`.

## Safety and tool boundaries

MyAgent's agent is designed to use a limited set of tools: web search, opening public websites, YouTube playback, games, and timers. It does not provide general file, folder, shell, or operating-system control.

Website destinations are restricted by the agent's URL safety checks. Local addresses and `file://` URLs are not permitted.

The React interface displays state and sends commands to the local agent. The Python agent is responsible for validating and performing supported actions.

## Project structure and character design

The character system is in `app/src/character/`. The active character is the Omar skin:

- `skins/omar/`: the active character, using the supplied 3D poses.
- `skins/critter/`: the original critter design, retained as an alternative.
- `skins/myagent/`: the earlier pocket-computer design, retained as an alternative.

Character skins use the shared character types and mood definitions. To change the active skin, update the export in `app/src/character/index.ts`.

The room and its day, focus-night, and break scenes are defined in `app/src/components/Room.tsx`.

## Design and development principles

1. **Limited authority:** MyAgent can only perform actions exposed through the agent's approved tools.
2. **Separation of concerns:** the UI displays state and sends commands; the Python agent validates and performs actions.
3. **Event-driven character behavior:** the character's mood reflects application events.
4. **Honest capabilities:** unfinished features are identified as planned rather than presented as working.
5. **Lightweight operation:** character motion uses CSS/SVG, and AI and voice models load locally as needed.
