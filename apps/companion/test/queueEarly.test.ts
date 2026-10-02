import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type CompanionServer } from "../src/server/server.js";

const TOKEN = "t";
const ORIGIN = "http://localhost:5199";
let s: CompanionServer;
let preflightCalls = 0;

beforeAll(async () => {
  s = await startServer({
    token: TOKEN, allowedOrigins: [ORIGIN], port: 0, maxQueue: 1,
    preflight: async () => {
      preflightCalls++;
      return { report: { ok: true, checks: [], measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 1, maxInkPercent: 1, encoding: "flate" } }, pdfPath: null, proof: null, dispose: async () => undefined };
    },
  });
});
afterAll(() => s.close());

// POST con cuerpo enviado a mano para controlar cuándo llega.
function post(declared: number) {
  const port = new URL(s.url).port;
  let status = 0;
  const handle: { req?: ReturnType<typeof request> } = {};
  const done = new Promise<number>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, method: "POST", path: "/preflight?widthIn=1&heightIn=1", headers: { authorization: `Bearer ${TOKEN}`, "content-length": String(declared) } },
      (res) => {
        status = res.statusCode ?? 0;
        res.resume();
        res.on("end", () => resolve(status));
      },
    );
    req.on("error", (e) => (status ? resolve(status) : reject(e)));
    handle.req = req;
    req.flushHeaders();
  });
  return { done, send: (data: string) => handle.req!.write(data), end: () => handle.req!.end(), destroy: () => handle.req!.destroy() };
}
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("tope de cola antes de leer el cuerpo", () => {
  it("una subida a medias ocupa el hueco y la siguiente recibe 503 sin enviar su cuerpo", async () => {
    const a = post(4);
    a.send("ab");
    await tick(100);
    // B anuncia un cuerpo enorme y no envía nada: el rechazo llega igualmente.
    const b = post(300 * 1024 * 1024);
    expect(await b.done).toBe(503);
    expect(preflightCalls).toBe(0);
    a.send("cd");
    a.end();
    expect(await a.done).toBe(200);
    expect(preflightCalls).toBe(1);
  });
  it("una subida que se aborta libera su hueco", async () => {
    const a = post(10);
    a.send("x");
    await tick(100);
    a.destroy();
    await a.done.catch(() => 0);
    await tick(100);
    const c = post(1);
    c.send("z");
    c.end();
    expect(await c.done).toBe(200);
  });
});
