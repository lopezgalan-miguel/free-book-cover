import { serverToEditorSchema, type McpToolName, type ToolError, type ToolOutcome } from "@free-book-cover/core";
import { executeTool, type ExecutorDeps } from "./executor";
import type { EditorStore } from "../store/editorStore";

export type McpLink = "off" | "connecting" | "connected" | "failed";
export type McpFailure = "unreachable" | "unauthorized" | "replaced" | "protocol";

export interface McpActivity {
  tool: McpToolName;
  ok: boolean;
  errorKind?: ToolError["kind"];
  at: number;
}

export interface McpSnapshot {
  link: McpLink;
  failure: McpFailure | null;
  /** Proyecto que el usuario ha autorizado; null mientras no lo haga. */
  authorizedProjectId: string | null;
  mcpClients: number;
  activity: readonly McpActivity[];
}

export interface McpConfig {
  baseUrl: string;
  token: string;
}

// Lo mínimo del WebSocket del navegador que se usa (sustituible en pruebas).
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface McpBridge {
  getSnapshot(): McpSnapshot;
  subscribe(l: () => void): () => void;
  connect(cfg: McpConfig): void;
  disconnect(): void;
  /** El usuario autoriza explícitamente el proyecto abierto. */
  authorize(): void;
  revoke(): void;
  dispose(): void;
}

export interface McpBridgeDeps extends Omit<ExecutorDeps, "authorizedProjectId"> {
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
}

const OPEN = 1;
const MAX_ACTIVITY = 8;
const wsUrl = (base: string) => `${base.trim().replace(/\/+$/, "").replace(/^http/, "ws")}/ws/editor`;

/**
 * Conexión del editor con el companion para MCP. Nada se conecta ni se autoriza solo: el usuario conecta
 * (con el token del companion) y autoriza el proyecto; sin autorización el editor rechaza toda llamada.
 * Las llamadas se ejecutan de una en una, con los comandos de core del store.
 */
export function createMcpBridge(deps: McpBridgeDeps): McpBridge {
  const store: EditorStore = deps.store;
  const now = deps.now ?? Date.now;
  const make = deps.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  let snap: McpSnapshot = { link: "off", failure: null, authorizedProjectId: null, mcpClients: 0, activity: [] };
  let socket: SocketLike | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const set = (p: Partial<McpSnapshot>) => {
    snap = { ...snap, ...p };
    listeners.forEach((l) => l());
  };
  const exec: ExecutorDeps = { ...deps, authorizedProjectId: () => snap.authorizedProjectId };
  const send = (msg: unknown) => {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify(msg));
  };

  const run = async (id: string, tool: McpToolName, args: unknown) => {
    let out: ToolOutcome;
    try {
      out = await executeTool(exec, tool, args);
    } catch {
      out = { ok: false, error: { kind: "internal" } };
    }
    set({ activity: [{ tool, ok: out.ok, ...(out.ok ? {} : { errorKind: out.error.kind }), at: now() }, ...snap.activity].slice(0, MAX_ACTIVITY) });
    send(out.ok ? { type: "result", id, ok: true, data: out.data } : { type: "result", id, ok: false, error: out.error });
  };

  // Si el proyecto abierto cambia, la autorización caduca.
  const unsubscribeStore = store.subscribe(() => {
    if (snap.authorizedProjectId !== null && store.getState().history.present.id !== snap.authorizedProjectId) bridge.revoke();
  });

  const close = (failure: McpFailure | null, link: McpLink) => {
    const s = socket;
    socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close();
      } catch {
        // ya cerrado
      }
    }
    set({ link, failure, authorizedProjectId: null, mcpClients: 0 });
  };

  const bridge: McpBridge = {
    getSnapshot: () => snap,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    connect(cfg) {
      if (snap.link === "connecting" || snap.link === "connected") return;
      let ws: SocketLike;
      try {
        ws = make(wsUrl(cfg.baseUrl));
      } catch {
        return set({ link: "failed", failure: "unreachable" });
      }
      socket = ws;
      set({ link: "connecting", failure: null });
      ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token: cfg.token }));
      ws.onmessage = (ev) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const msg = serverToEditorSchema.safeParse(raw);
        if (!msg.success) return;
        const m = msg.data;
        if (m.type === "ready") set({ link: "connected", mcpClients: m.mcpClients });
        else if (m.type === "status") set({ mcpClients: m.mcpClients });
        else queue = queue.then(() => run(m.id, m.tool, m.args));
      };
      ws.onclose = (ev) => {
        if (socket !== ws) return;
        const wasConnected = snap.link === "connected";
        close(ev.code === 4401 ? "unauthorized" : ev.code === 4409 ? "replaced" : ev.code === 4400 ? "protocol" : "unreachable", wasConnected && ev.code === 1000 ? "off" : "failed");
      };
      ws.onerror = () => undefined;
    },
    disconnect() {
      close(null, "off");
    },
    authorize() {
      if (snap.link !== "connected") return;
      const id = store.getState().history.present.id;
      send({ type: "authorize", projectId: id });
      set({ authorizedProjectId: id });
    },
    dispose() {
      unsubscribeStore();
      close(null, "off");
    },
    revoke() {
      if (snap.authorizedProjectId === null) return;
      send({ type: "revoke" });
      set({ authorizedProjectId: null });
    },
  };
  return bridge;
}
