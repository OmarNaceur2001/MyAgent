// Electron main process: creates the two windows and (optionally) starts the agent.
// It does NOT do any computer control itself: that is the Python agent's job.

const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, screen } = require("electron");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { fileURLToPath } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

// MYAGENT_* is current; MIMO_* still honoured so existing setups keep working.
const DEV = (process.env.MYAGENT_DEV ?? process.env.MIMO_DEV) === "1";
const DEV_URL = "http://localhost:5173";
// Never reuse a caller-supplied environment token in the desktop app.
// Each launch gets a fresh secret; browser-only development configures its own.
const AGENT_SESSION_TOKEN = randomBytes(32).toString("hex");
const AGENT_DIR = path.resolve(__dirname, "..", "..", "agent");
const COMPANION = { width: 240, height: 300 };

let mainWin = null;
let companionWin = null;
let agentProc = null;
let quitting = false;

// ---------- windows ----------

function load(win, view) {
  if (DEV) win.loadURL(`${DEV_URL}/?view=${view}`);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query: { view } });
}

const secure = {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function createMain() {
  mainWin = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: "MyAgent",
    backgroundColor: "#FBF8F2",
    autoHideMenuBar: true,
    show: false,
    webPreferences: secure,
  });
  load(mainWin, "main");
  mainWin.once("ready-to-show", () => mainWin.show());
  // Closing the big window just hides it: MyAgent keeps floating on the desktop.
  mainWin.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
}

function companionBounds() {
  const saved = readPrefs().companion;
  const area = screen.getPrimaryDisplay().workArea;
  if (saved && screen.getAllDisplays().some((d) => inside(saved, d.workArea))) return saved;
  return {
    x: area.x + area.width - COMPANION.width - 24,
    y: area.y + area.height - COMPANION.height - 12,
  };
}

function createCompanion() {
  const { x, y } = companionBounds();
  companionWin = new BrowserWindow({
    ...COMPANION,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: secure,
  });
  companionWin.setAlwaysOnTop(true, "floating");
  // Clicks pass through the empty, transparent parts of the window;
  // the renderer turns this off while the mouse is over MyAgent.
  companionWin.setIgnoreMouseEvents(true, { forward: true });
  load(companionWin, "companion");
}

function openMain() {
  if (!mainWin) createMain();
  mainWin.show();
  mainWin.focus();
}

// Only the expected top-level MyAgent renderer windows may use privileged IPC.
function isTrustedFrame(event, win) {
  if (!win || event.sender !== win.webContents || !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame) return false;
  try {
    const frameUrl = new URL(event.senderFrame.url);
    if (DEV) {
      return frameUrl.origin === new URL(DEV_URL).origin && frameUrl.pathname === "/";
    }
    return frameUrl.protocol === "file:" &&
      path.resolve(fileURLToPath(frameUrl)) === path.resolve(__dirname, "..", "dist", "index.html");
  } catch {
    return false;
  }
}

function isTrustedAppFrame(event) {
  return isTrustedFrame(event, mainWin) || isTrustedFrame(event, companionWin);
}

// ---------- IPC (window controls only) ----------

ipcMain.on("myagent:open-main", (event) => {
  if (isTrustedAppFrame(event)) openMain();
});

// Native folder selection is the only way the UI can request a new local scope.
// It returns one directory path; it never grants access by itself.
ipcMain.handle("myagent:select-folder", async (event) => {
  if (!isTrustedFrame(event, mainWin)) return null;
  const result = await dialog.showOpenDialog(mainWin, {
    title: "Choose a folder MyAgent may access",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

// A random per-launch token is disclosed only to the verified app windows.
ipcMain.handle("myagent:agent-token", (event) =>
  isTrustedAppFrame(event) ? AGENT_SESSION_TOKEN : null
);

ipcMain.on("myagent:companion-hover", (event, hovering) => {
  if (!isTrustedFrame(event, companionWin)) return;
  companionWin?.setIgnoreMouseEvents(!hovering, { forward: true });
});
// Dragging is done by hand (pointer events in the renderer) instead of
// -webkit-app-region, because drag regions swallow hover, double-click and
// right-click on Windows.
ipcMain.on("myagent:companion-move", (event, x, y) => {
  if (!isTrustedFrame(event, companionWin)) return;
  if (Number.isFinite(x) && Number.isFinite(y)) companionWin?.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on("myagent:companion-drag-end", (event) => {
  if (!isTrustedFrame(event, companionWin) || !companionWin) return;
  const [x, y] = companionWin.getPosition();
  writePrefs({ ...readPrefs(), companion: { x, y } });
});
ipcMain.on("myagent:companion-menu", (event) => {
  if (!isTrustedFrame(event, companionWin)) return;
  Menu.buildFromTemplate([
    { label: "Open MyAgent", click: openMain },
    { type: "separator" },
    { label: "Quit MyAgent", click: () => app.quit() },
  ]).popup({ window: companionWin });
});

// ---------- agent ----------

function agentIsUp() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8765/health", (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findPython() {
  const fromEnv = process.env.MYAGENT_PYTHON ?? process.env.MIMO_PYTHON;
  if (fromEnv) return fromEnv;
  const candidates = [
    path.join(AGENT_DIR, ".venv", "Scripts", "python.exe"), // Windows venv
    path.join(AGENT_DIR, ".venv", "bin", "python"), // macOS / Linux venv
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// If the agent isn't already running and a venv exists, start it for the user.
// Otherwise the UI shows how to start it by hand.
async function startAgent() {
  if (await agentIsUp()) {
    console.warn("[myagent] port 8765 is already occupied. Stop the existing agent and relaunch MyAgent so it can establish its private session.");
    return;
  }
  const python = findPython();
  if (!python) {
    console.log("[myagent] agent not running and no agent/.venv found: create the Python environment, then restart MyAgent.");
    return;
  }
  agentProc = spawn(python, ["run.py"], {
    cwd: AGENT_DIR,
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, MYAGENT_LOCAL_TOKEN: AGENT_SESSION_TOKEN },
  });
  agentProc.on("exit", (code) => {
    console.log(`[myagent] agent exited (${code})`);
    agentProc = null;
  });
}

// ---------- prefs ----------

const prefsFile = () => path.join(app.getPath("userData"), "prefs.json");
function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
  } catch {
    return {};
  }
}
function writePrefs(p) {
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(p, null, 2));
  } catch (err) {
    console.warn("[myagent] could not save prefs", err);
  }
}
const inside = (pt, a) => pt.x >= a.x && pt.y >= a.y && pt.x < a.x + a.width && pt.y < a.y + a.height;

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", openMain);
  app.whenReady().then(async () => {
    await startAgent();
    createCompanion();
    createMain();
    // Talk to MyAgent from anywhere, even when another app is focused.
    // The companion window is always alive, so it handles the shortcut.
    const ok = globalShortcut.register("CommandOrControl+Shift+Space", () => {
      companionWin?.webContents.send("myagent:talk");
    });
    if (!ok) console.warn("[myagent] Ctrl+Shift+Space is taken by another app");
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("before-quit", () => {
    quitting = true;
    if (agentProc) agentProc.kill();
  });
  app.on("window-all-closed", () => app.quit());
}
