// Starts MyAgent for development: the Vite dev server + Electron.
// Runs both straight from Node, with no shell in between, so it works on any
// Windows setup (no dependency on cmd.exe or the PATH).
import { spawn } from "node:child_process";
import electron from "electron"; // the path to the Electron binary
import { createServer } from "vite";

const server = await createServer();
await server.listen();
server.printUrls();

const app = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, MYAGENT_DEV: "1" },
});

const stop = async (code = 0) => {
  await server.close();
  process.exit(code);
};
app.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => app.kill());
process.on("SIGTERM", () => app.kill());
