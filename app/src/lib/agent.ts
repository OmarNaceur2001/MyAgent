import type { AgentEvent, CommandName } from "./events";
import { desktop } from "./desktop";

// WebSocket link to the Python agent, with automatic reconnect.
// Both windows (main + companion) open their own link; the agent keeps them in sync.

export const AGENT_URL = "ws://127.0.0.1:8765/ws";

type Listener = (e: AgentEvent) => void;
type ConnListener = (connected: boolean) => void;

class AgentLink {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private connListeners = new Set<ConnListener>();
  private retry = 0;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    this.open();
  }

  private async open() {
    if (!this.started) return;
    let token = await desktop.getAgentToken().catch(() => null);
    // Browser-only development has no Electron preload; allow an explicit,
    // untracked Vite environment token for that local development mode only.
    if (!token && import.meta.env.DEV) token = import.meta.env.VITE_MYAGENT_LOCAL_TOKEN ?? null;
    if (!this.started) return;
    if (!token) {
      this.connListeners.forEach((l) => l(false));
      console.warn("MyAgent: no local-session token is available; use the Electron app or configure the browser-dev token.");
      return;
    }

    const ws = new WebSocket(AGENT_URL, ["myagent.v1", `myagent-auth.${token}`]);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connListeners.forEach((l) => l(true));
    };
    ws.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data) as AgentEvent;
        this.listeners.forEach((l) => l(evt));
      } catch {
        console.warn("MyAgent: ignored a malformed event", msg.data);
      }
    };
    ws.onclose = () => {
      this.connListeners.forEach((l) => l(false));
      if (!this.started) return;
      // back off gently: 0.5s, 1s, 2s … up to 5s
      const wait = Math.min(5000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), wait);
    };
    ws.onerror = () => ws.close();
  }

  send(name: CommandName, args: Record<string, unknown> = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: "cmd", payload: { name, args } }));
    return true;
  }

  onEvent(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onConnection(l: ConnListener) {
    this.connListeners.add(l);
    return () => this.connListeners.delete(l);
  }
}

export const agent = new AgentLink();
