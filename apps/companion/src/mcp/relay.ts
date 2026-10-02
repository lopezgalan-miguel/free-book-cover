import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { serverToMcpSchema, type McpToolName, type ToolError, type ToolOutcome } from "@free-book-cover/core";

export interface RelayOptions {
  /** URL del companion (http:// o ws://), p. ej. http://127.0.0.1:47321. */
  url: string;
  token: string;
  /** Margen sobre el timeout del companion antes de abandonar la llamada. */
  callTimeoutMs?: number;
  connectTimeoutMs?: number;
}

export interface Relay {
  call(tool: McpToolName, args: unknown): Promise<ToolOutcome>;
  close(): void;
}

const fail = (error: ToolError): ToolOutcome => ({ ok: false, error });
const NO_COMPANION: ToolError = { kind: "editor_disconnected", reason: "no_companion" };

/** Cliente del canal /ws/mcp del companion. Conecta bajo demanda y reconecta en la llamada siguiente. */
export function createRelay(opts: RelayOptions): Relay {
  const base = opts.url.replace(/^http/, "ws").replace(/\/+$/, "");
  const callTimeout = opts.callTimeoutMs ?? 30_000;
  const connectTimeout = opts.connectTimeoutMs ?? 5_000;
  let socket: Promise<WebSocket | null> | null = null;
  // El companion cerró el canal por token no válido.
  let denied = false;
  const pending = new Map<string, (o: ToolOutcome) => void>();

  const failAll = (error: ToolError) => {
    for (const [id, done] of [...pending]) {
      pending.delete(id);
      done(fail(error));
    }
  };

  const connect = (): Promise<WebSocket | null> =>
    new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${base}/ws/mcp`, { handshakeTimeout: connectTimeout });
      } catch {
        return resolve(null);
      }
      let ready = false;
      const dead = () => {
        socket = null;
        resolve(null);
        failAll(NO_COMPANION);
      };
      ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token: opts.token })));
      ws.on("message", (data) => {
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString());
        } catch {
          return;
        }
        const msg = serverToMcpSchema.safeParse(raw);
        if (!msg.success) return;
        if (msg.data.type === "ready") {
          ready = true;
          return resolve(ws);
        }
        const done = pending.get(msg.data.id);
        if (!done) return;
        pending.delete(msg.data.id);
        done(msg.data.ok ? { ok: true, data: msg.data.data } : fail(msg.data.error));
      });
      ws.on("close", (code) => {
        socket = null;
        denied = code === 4401;
        if (!ready) resolve(null);
        // Token rechazado: el cliente no está autorizado, no es que el companion falte.
        failAll(code === 4401 ? { kind: "editor_disconnected", reason: "not_authorized" } : NO_COMPANION);
      });
      ws.on("error", dead);
    });

  return {
    async call(tool, args) {
      if (!socket) denied = false;
      socket ??= connect();
      const ws = await socket;
      if (!ws || ws.readyState !== ws.OPEN) return fail(denied ? { kind: "editor_disconnected", reason: "not_authorized" } : NO_COMPANION);
      const id = randomUUID();
      return new Promise<ToolOutcome>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(fail({ kind: "editor_disconnected", reason: "timeout" }));
        }, callTimeout);
        pending.set(id, (o) => {
          clearTimeout(timer);
          resolve(o);
        });
        ws.send(JSON.stringify({ type: "call", id, tool, args }));
      });
    },
    close() {
      void socket?.then((ws) => ws?.close());
      socket = null;
    },
  };
}
