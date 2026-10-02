import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  WS_CLOSE, WS_EDITOR_PATH, WS_MCP_PATH, editorToServerSchema, mcpToServerSchema,
  type McpToolName, type ServerToEditor, type ToolError, type ToolOutcome,
} from "@free-book-cover/core";

export interface BridgeOptions {
  token: string;
  allowedOrigins: readonly string[];
  hostOk(host: string | undefined): boolean;
  /** Espera máxima de la respuesta del editor. */
  callTimeoutMs?: number;
  /** Tiempo para presentar el token tras abrir el canal. */
  helloTimeoutMs?: number;
  /** Tamaño máximo de un mensaje (cubre una imagen importada en base64). */
  maxMessageBytes?: number;
  /** Llamadas simultáneas pendientes de respuesta del editor. */
  maxPending?: number;
}

export interface BridgeState {
  editorConnected: boolean;
  /** Proyecto autorizado por el usuario en el editor, o null. */
  authorizedProjectId: string | null;
  mcpClients: number;
  pending: number;
}

export interface Bridge {
  state(): BridgeState;
  close(): Promise<void>;
}

const tokenOk = (given: string, token: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

const ERR = {
  noEditor: { kind: "editor_disconnected", reason: "no_editor" },
  notAuthorized: { kind: "editor_disconnected", reason: "not_authorized" },
  timeout: { kind: "editor_disconnected", reason: "timeout" },
} as const satisfies Record<string, ToolError>;

interface Pending {
  mcp: WebSocket;
  mcpId: string;
  timer: NodeJS.Timeout;
}

/**
 * Canal WebSocket sobre el servidor HTTP local: /ws/editor (el editor del navegador, con Origin permitido)
 * y /ws/mcp (el proceso stdio de MCP, sin Origin). Ambos presentan el token en el primer mensaje, nunca en la URL.
 * El companion solo reenvía: valida el proyecto autorizado y el editor ejecuta los comandos de core.
 */
export function attachBridge(server: Server, opts: BridgeOptions): Bridge {
  const callTimeout = opts.callTimeoutMs ?? 20_000;
  const helloTimeout = opts.helloTimeoutMs ?? 5_000;
  const maxPending = opts.maxPending ?? 16;
  const wss = new WebSocketServer({ noServer: true, maxPayload: opts.maxMessageBytes ?? 40 * 1024 * 1024 });

  let editor: { ws: WebSocket; projectId: string | null } | null = null;
  const mcps = new Set<WebSocket>();
  const pending = new Map<string, Pending>();

  const sendJson = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const toEditor = (msg: ServerToEditor) => editor && sendJson(editor.ws, msg);
  const notifyEditor = () => toEditor({ type: "status", mcpClients: mcps.size });
  const reply = (ws: WebSocket, id: string, out: ToolOutcome) =>
    sendJson(ws, out.ok ? { type: "result", id, ok: true, data: out.data } : { type: "result", id, ok: false, error: out.error });

  const failPending = (error: ToolError, only?: (p: Pending) => boolean) => {
    for (const [id, p] of pending) {
      if (only && !only(p)) continue;
      clearTimeout(p.timer);
      pending.delete(id);
      reply(p.mcp, p.mcpId, { ok: false, error });
    }
  };

  const onMcpCall = (ws: WebSocket, msg: { id: string; tool: McpToolName; args: unknown }) => {
    if (!editor) return reply(ws, msg.id, { ok: false, error: ERR.noEditor });
    if (editor.projectId === null) return reply(ws, msg.id, { ok: false, error: ERR.notAuthorized });
    if (pending.size >= maxPending) return reply(ws, msg.id, { ok: false, error: { kind: "busy" } });
    const args = typeof msg.args === "object" && msg.args !== null && !Array.isArray(msg.args) ? { ...(msg.args as Record<string, unknown>) } : null;
    if (!args) return reply(ws, msg.id, { ok: false, error: { kind: "invalid_params", issues: ["los argumentos deben ser un objeto"] } });
    // Un proyecto distinto del autorizado se trata como no autorizado, sin revelar cuál lo está.
    if (args.projectId !== undefined && args.projectId !== editor.projectId) return reply(ws, msg.id, { ok: false, error: ERR.notAuthorized });
    args.projectId = editor.projectId;
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reply(ws, msg.id, { ok: false, error: ERR.timeout });
    }, callTimeout);
    pending.set(id, { mcp: ws, mcpId: msg.id, timer });
    toEditor({ type: "call", id, tool: msg.tool, args });
  };

  const handleEditor = (ws: WebSocket, raw: unknown) => {
    const parsed = editorToServerSchema.safeParse(raw);
    if (!parsed.success) return ws.close(WS_CLOSE.protocol, "protocol");
    const msg = parsed.data;
    if (!editor || editor.ws !== ws) return;
    if (msg.type === "authorize") editor.projectId = msg.projectId;
    else if (msg.type === "revoke") editor.projectId = null;
    else if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      reply(p.mcp, p.mcpId, msg.ok ? { ok: true, data: msg.data } : { ok: false, error: msg.error });
    }
  };

  const handleMcp = (ws: WebSocket, raw: unknown) => {
    const parsed = mcpToServerSchema.safeParse(raw);
    if (!parsed.success || parsed.data.type !== "call") return ws.close(WS_CLOSE.protocol, "protocol");
    onMcpCall(ws, parsed.data);
  };

  const accept = (ws: WebSocket, role: "editor" | "mcp") => {
    let authed = false;
    const hello = setTimeout(() => ws.close(WS_CLOSE.unauthorized, "unauthorized"), helloTimeout);
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) return ws.close(WS_CLOSE.protocol, "protocol");
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        return ws.close(WS_CLOSE.protocol, "protocol");
      }
      if (!authed) {
        const h = typeof raw === "object" && raw !== null ? (raw as { type?: unknown; token?: unknown }) : {};
        if (h.type !== "hello" || typeof h.token !== "string" || !tokenOk(h.token, opts.token)) return ws.close(WS_CLOSE.unauthorized, "unauthorized");
        authed = true;
        clearTimeout(hello);
        if (role === "editor") {
          // El editor más reciente sustituye al anterior (recarga de la pestaña).
          if (editor) {
            const old = editor.ws;
            editor = null;
            failPending(ERR.noEditor);
            old.close(WS_CLOSE.replaced, "replaced");
          }
          editor = { ws, projectId: null };
          sendJson(ws, { type: "ready", mcpClients: mcps.size });
        } else {
          mcps.add(ws);
          sendJson(ws, { type: "ready" });
          notifyEditor();
        }
        return;
      }
      if (role === "editor") handleEditor(ws, raw);
      else handleMcp(ws, raw);
    });
    ws.on("close", () => {
      clearTimeout(hello);
      if (role === "editor" && editor?.ws === ws) {
        editor = null;
        failPending(ERR.noEditor);
      } else if (role === "mcp") {
        mcps.delete(ws);
        for (const [id, p] of pending) {
          if (p.mcp !== ws) continue;
          clearTimeout(p.timer);
          pending.delete(id);
        }
        notifyEditor();
      }
    });
    ws.on("error", () => ws.terminate());
  };

  const refuse = (socket: Duplex, status: string) => {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => undefined);
    // Mismas barreras que el HTTP: Host local (DNS rebinding) y Origin.
    if (!opts.hostOk(req.headers.host)) return refuse(socket, "403 Forbidden");
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const origin = req.headers.origin;
    let role: "editor" | "mcp";
    if (path === WS_EDITOR_PATH) {
      if (origin === undefined || !opts.allowedOrigins.includes(origin)) return refuse(socket, "403 Forbidden");
      role = "editor";
    } else if (path === WS_MCP_PATH) {
      // El proceso MCP no es un navegador: cualquier Origin (una página web) se rechaza.
      if (origin !== undefined) return refuse(socket, "403 Forbidden");
      role = "mcp";
    } else return refuse(socket, "404 Not Found");
    wss.handleUpgrade(req, socket, head, (ws) => accept(ws, role));
  });

  return {
    state: () => ({ editorConnected: editor !== null, authorizedProjectId: editor?.projectId ?? null, mcpClients: mcps.size, pending: pending.size }),
    async close() {
      failPending(ERR.noEditor);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
