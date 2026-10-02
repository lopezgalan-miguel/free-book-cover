import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { attachBridge, type Bridge, type BridgeOptions } from "./bridge.js";
import { runPreflight, type PreflightResult } from "../preflight/pipeline.js";

export const COMPANION_VERSION = "0.1.0";
export const DEFAULT_PORT = 47321;
/** Máximo del PNG de entrada (50 MP sin comprimir caben de sobra). */
export const MAX_BODY_BYTES = 400 * 1024 * 1024;
const KEEP_RESULTS = 2;
const MAX_QUEUE = 8;

export interface ServerOptions {
  /** Token por arranque; si falta se genera uno aleatorio. */
  token?: string;
  /** Orígenes del editor autorizados (CORS y comprobación de Origin). */
  allowedOrigins: readonly string[];
  /** 0 = puerto libre (pruebas). */
  port?: number;
  /** Trabajos de preimpresión admitidos a la vez (en curso + en cola); el resto recibe 503. */
  maxQueue?: number;
  /** Límite del cuerpo (pruebas). */
  maxBodyBytes?: number;
  /** Sustituible en pruebas. */
  preflight?: typeof runPreflight;
  /** Ajustes del canal WebSocket del MCP (pruebas). */
  bridge?: Partial<Pick<BridgeOptions, "callTimeoutMs" | "helloTimeoutMs" | "maxMessageBytes" | "maxPending">>;
}

export interface CompanionServer {
  server: Server;
  token: string;
  port: number;
  url: string;
  /** Canal WebSocket editor <-> MCP (Paso 8). */
  bridge: Bridge;
  close(): Promise<void>;
}

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(json), ...headers });
  res.end(json);
};

function tokenOk(given: string | undefined, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

const dim = (v: string | null): number | null => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

/** Servidor local mínimo: solo 127.0.0.1, token por arranque, CORS restringido. El canal WebSocket del MCP (bridge.ts) cuelga del mismo servidor. */
export async function startServer(opts: ServerOptions): Promise<CompanionServer> {
  const token = opts.token ?? randomBytes(24).toString("base64url");
  const preflight = opts.preflight ?? runPreflight;
  const results = new Map<string, PreflightResult>();
  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  const maxQueue = opts.maxQueue ?? MAX_QUEUE;
  let boundPort = 0;
  const maxBody = opts.maxBodyBytes ?? MAX_BODY_BYTES;

  const hostOk = (host: string | undefined) => host === `127.0.0.1:${boundPort}` || host === `localhost:${boundPort}`;

  const corsFor = (origin: string | undefined): Record<string, string> =>
    origin && opts.allowedOrigins.includes(origin)
      ? {
          "access-control-allow-origin": origin, vary: "Origin",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-private-network": "true",
          "access-control-expose-headers": "content-disposition",
        }
      : {};

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    // Protege frente a DNS rebinding: solo se atiende con Host local.
    if (!hostOk(req.headers.host)) return send(res, 403, { error: "host_forbidden" });
    if (origin !== undefined && !opts.allowedOrigins.includes(origin)) return send(res, 403, { error: "origin_forbidden" });
    const cors = corsFor(origin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return void res.end();
    }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${boundPort}`);
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    const authorized = tokenOk(bearer, token);

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, name: "kdp-cover-companion", version: COMPANION_VERSION, authorized }, cors);
    }
    if (!authorized) return send(res, 401, { error: "unauthorized" }, cors);

    if (req.method === "POST" && url.pathname === "/preflight") {
      const widthIn = dim(url.searchParams.get("widthIn"));
      const heightIn = dim(url.searchParams.get("heightIn"));
      if (widthIn === null || heightIn === null) return send(res, 400, { error: "invalid_size" }, cors);
      if (Number(req.headers["content-length"] ?? 0) > maxBody) return send(res, 413, { error: "too_large" }, { ...cors, connection: "close" });
      const body = await readBody(req, maxBody);
      if (!body) return send(res, 413, { error: "too_large" }, cors);
      if (body.length === 0) return send(res, 400, { error: "empty_body" }, cors);
      // Un trabajo cada vez: Ghostscript y sharp son pesados. La cola tiene tope.
      if (queued >= maxQueue) return send(res, 503, { error: "busy" }, cors);
      queued++;
      const job = queue.then(() => preflight({ image: body, widthIn, heightIn }));
      queue = job.then(() => undefined, () => undefined).finally(() => void queued--);
      let result: PreflightResult;
      try {
        result = await job;
      } catch (e) {
        // El detalle (rutas temporales, líneas de comando) solo va a la consola del companion.
        console.error("preflight falló:", e);
        return send(res, 500, { error: "preflight_failed" }, cors);
      }
      const id = result.pdfPath ? randomUUID() : null;
      if (id) {
        results.set(id, result);
        for (const [old, r] of [...results].slice(0, Math.max(0, results.size - KEEP_RESULTS))) {
          results.delete(old);
          void r.dispose();
        }
      } else void result.dispose();
      return send(res, 200, { id, report: result.report, proofPng: result.proof ? result.proof.toString("base64") : null }, cors);
    }

    const m = req.method === "GET" ? /^\/preflight\/([\w-]+)\/pdf$/.exec(url.pathname) : null;
    if (m) {
      const r = results.get(m[1]!);
      if (!r?.pdfPath) return send(res, 404, { error: "not_found" }, cors);
      const data = await readFile(r.pdfPath);
      res.writeHead(200, { "content-type": "application/pdf", "content-length": data.length, ...cors });
      return void res.end(data);
    }
    return send(res, 404, { error: "not_found" }, cors);
  };

  const server = createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: "internal" }, corsFor(req.headers.origin));
      else res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Solo el bucle local: nada se expone a la red.
    server.listen(opts.port ?? DEFAULT_PORT, "127.0.0.1", resolve);
  });
  boundPort = (server.address() as AddressInfo).port;
  const bridge = attachBridge(server, { token, allowedOrigins: opts.allowedOrigins, hostOk, ...opts.bridge });
  return {
    server, token, bridge, port: boundPort, url: `http://127.0.0.1:${boundPort}`,
    async close() {
      await bridge.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await Promise.all([...results.values()].map((r) => r.dispose()));
      results.clear();
    },
  };
}
