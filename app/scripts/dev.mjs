// Starts MyAgent in Electron when its native binary is installed.
// If Electron's binary download is missing, fall back to the documented
// browser-only development mode and start the authenticated Python agent.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const repoDir = resolve(appDir, "..");
const agentDir = join(repoDir, "agent");
const python = join(agentDir, ".venv", "Scripts", "python.exe");
const AGENT_HOST = "127.0.0.1";
const AGENT_PORT = 8765;

function portIsOpen(host, port) {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolveResult(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolveResult(false);
    });
    socket.once("error", () => resolveResult(false));
  });
}

async function waitForAgent(child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Python agent exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`http://${AGENT_HOST}:${AGENT_PORT}/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) {
        const health = await response.json();
        if (health.ok) return health;
      }
    } catch {
      // The agent may still be starting; retry until the timeout.
    }
    await new Promise((resolveResult) => setTimeout(resolveResult, 500));
  }
  throw new Error("Python agent did not become healthy within 30 seconds.");
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolveResult) => server.close(() => resolveResult()));
}

async function runBrowserMode(reason) {
  console.warn("\n[MyAgent] Electron desktop binary is unavailable.");
  console.warn(`[MyAgent] Reason: ${reason}`);
  console.warn("[MyAgent] Starting browser mode instead. The floating desktop companion is unavailable in this mode.\n");

  if (!existsSync(python)) {
    throw new Error(`Python environment not found at ${python}. Create agent/.venv first.`);
  }
  if (await portIsOpen(AGENT_HOST, AGENT_PORT)) {
    throw new Error(
      `Port ${AGENT_PORT} is already in use. Stop the old MyAgent backend (press Ctrl+C in its terminal), then run npm run dev again.`,
    );
  }

  const token = randomBytes(32).toString("hex");
  process.env.MYAGENT_LOCAL_TOKEN = token;
  process.env.VITE_MYAGENT_LOCAL_TOKEN = token;

  const agent = spawn(python, ["run.py"], {
    cwd: agentDir,
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, MYAGENT_LOCAL_TOKEN: token },
  });

  let server;
  let stopping = false;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    agent.kill();
    await closeServer(server);
    process.exitCode = code;
  };

  agent.once("error", (error) => {
    console.error("[MyAgent] Could not start Python agent:", error);
    void stop(1);
  });
  agent.once("exit", (code) => {
    if (!stopping) {
      console.error(`[MyAgent] Python agent exited (${code ?? "unknown"}).`);
      void stop(code ?? 1);
    }
  });
  process.once("SIGINT", () => void stop(0));
  process.once("SIGTERM", () => void stop(0));

  try {
    const health = await waitForAgent(agent);
    console.log(`[MyAgent] Python agent ready. Ollama model available: ${Boolean(health.features?.llm)}.`);
    server = await createServer();
    await server.listen();
    server.printUrls();
    console.log("[MyAgent] Open the local URL above. Keep this terminal running.");
  } catch (error) {
    await stop(1);
    throw error;
  }
}

let electronPath;
try {
  const electronModule = await import("electron");
  electronPath = electronModule.default;
  if (typeof electronPath !== "string" || !existsSync(electronPath)) {
    throw new Error("The Electron package exists, but its native executable is missing.");
  }
} catch (error) {
  await runBrowserMode(error instanceof Error ? error.message : String(error));
}

if (electronPath && existsSync(electronPath)) {
  const server = await createServer();
  await server.listen();
  server.printUrls();

  const app = spawn(electronPath, ["."], {
    stdio: "inherit",
    env: { ...process.env, MYAGENT_DEV: "1" },
  });

  let stopping = false;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    await closeServer(server);
    process.exitCode = code;
  };

  app.once("error", (error) => {
    console.error("[MyAgent] Electron failed to start:", error);
    void stop(1);
  });
  app.once("exit", (code) => void stop(code ?? 0));
  process.once("SIGINT", () => app.kill());
  process.once("SIGTERM", () => app.kill());
}
