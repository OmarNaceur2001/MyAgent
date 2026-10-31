// Electron main process: creates the two windows and (optionally) starts the agent.
// It does NOT do any computer control itself: that is the Python agent's job.

const { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const DEV = process.env.MIMO_DEV === "1";
const DEV_URL = "http://localhost:5173";
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
    title: "MIMO",
    backgroundColor: "#E6E2F8",
    autoHideMenuBar: true,
    show: false,
    webPreferences: secure,
  });
  load(mainWin, "main");
  mainWin.once("ready-to-show", () => mainWin.show());
  // Closing the big window just hides it: MIMO keeps floating on the desktop.
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
  // the renderer turns this off while the mouse is over MIMO.
  companionWin.setIgnoreMouseEvents(true, { forward: true });
  load(companionWin, "companion");
}

function openMain() {
  if (!mainWin) createMain();
  mainWin.show();
  mainWin.focus();
}

// ---------- IPC (window controls only) ----------

ipcMain.on("mimo:open-main", openMain);
ipcMain.on("mimo:companion-hover", (_e, hovering) => {
  companionWin?.setIgnoreMouseEvents(!hovering, { forward: true });
});
// Dragging is done by hand (pointer events in the renderer) instead of
// -webkit-app-region, because drag regions swallow hover, double-click and
// right-click on Windows.
ipcMain.on("mimo:companion-move", (_e, x, y) => {
  if (Number.isFinite(x) && Number.isFinite(y)) companionWin?.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on("mimo:companion-drag-end", () => {
  if (!companionWin) return;
  const [x, y] = companionWin.getPosition();
  writePrefs({ ...readPrefs(), companion: { x, y } });
});
ipcMain.on("mimo:companion-menu", () => {
  Menu.buildFromTemplate([
    { label: "Open MIMO", click: openMain },
    { type: "separator" },
    { label: "Quit MIMO", click: () => app.quit() },
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
  if (process.env.MIMO_PYTHON) return process.env.MIMO_PYTHON;
  const candidates = [
    path.join(AGENT_DIR, ".venv", "Scripts", "python.exe"), // Windows venv
    path.join(AGENT_DIR, ".venv", "bin", "python"), // macOS / Linux venv
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// If the agent isn't already running and a venv exists, start it for the user.
// Otherwise the UI shows how to start it by hand.
async function startAgent() {
  if (await agentIsUp()) return;
  const python = findPython();
  if (!python) {
    console.log("[mimo] agent not running and no agent/.venv found: start it with `python run.py`");
    return;
  }
  agentProc = spawn(python, ["run.py"], { cwd: AGENT_DIR, windowsHide: true, stdio: "inherit" });
  agentProc.on("exit", (code) => {
    console.log(`[mimo] agent exited (${code})`);
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
    console.warn("[mimo] could not save prefs", err);
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
    // Talk to MIMO from anywhere, even when another app is focused.
    // The companion window is always alive, so it handles the shortcut.
    const ok = globalShortcut.register("CommandOrControl+Shift+Space", () => {
      companionWin?.webContents.send("mimo:talk");
    });
    if (!ok) console.warn("[mimo] Ctrl+Shift+Space is taken by another app");
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("before-quit", () => {
    quitting = true;
    if (agentProc) agentProc.kill();
  });
  app.on("window-all-closed", () => app.quit());
}
