import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { request } from "node:http";
import { startServer, type CompanionServer } from "../src/server/server.js";
import { openWs, type TestWs } from "./helpers/ws.js";

const ORIGIN = "http://localhost:5199";
const TOKEN = "secreto";
let s: CompanionServer;
const open: TestWs[] = [];

const wsUrl = (path: string) => `ws://127.0.0.1:${s.port}${path}`;
async function editor(authorize?: string): Promise<TestWs> {
  const e = await openWs(wsUrl("/ws/editor"), { origin: ORIGIN });
  open.push(e);
  e.send({ type: "hello", token: TOKEN });
  expect(await e.next()).toMatchObject({ type: "ready" });
  if (authorize) {
    e.send({ type: "authorize", projectId: authorize });
    await tick();
  }
  return e;
}
async function mcp(): Promise<TestWs> {
  const m = await openWs(wsUrl("/ws/mcp"));
  open.push(m);
  m.send({ type: "hello", token: TOKEN });
  expect(await m.next()).toMatchObject({ type: "ready" });
  return m;
}
// Salta los avisos de estado (clientes MCP) hasta la siguiente llamada.
async function nextCall(e: TestWs, ms = 2000): Promise<any> {
  for (;;) {
    const m = await e.next(ms);
    if (m.type === "call") return m;
  }
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const call = (id: string, tool: string, args: unknown) => ({ type: "call", id, tool, args });

beforeEach(async () => {
  s = await startServer({ token: TOKEN, allowedOrigins: [ORIGIN], port: 0, bridge: { callTimeoutMs: 400, helloTimeoutMs: 300, maxPending: 2 } });
});
afterEach(async () => {
  for (const o of open.splice(0)) o.ws.terminate();
  await s.close();
});

describe("canal WebSocket: acceso", () => {
  it("el editor exige un Origin autorizado", async () => {
    await expect(openWs(wsUrl("/ws/editor"))).rejects.toMatchObject({ status: 403 });
    await expect(openWs(wsUrl("/ws/editor"), { origin: "http://evil.example" })).rejects.toMatchObject({ status: 403 });
  });
  it("el proceso MCP no admite ningún Origin (una web no puede ser cliente MCP)", async () => {
    await expect(openWs(wsUrl("/ws/mcp"), { origin: ORIGIN })).rejects.toMatchObject({ status: 403 });
  });
  it("rechaza un Host que no es local (DNS rebinding)", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: s.port, path: "/ws/mcp", headers: { host: "evil.example", connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" } });
      req.on("response", (res) => resolve(res.statusCode!));
      req.on("upgrade", () => resolve(101));
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });
  it("rutas desconocidas dan 404", async () => {
    await expect(openWs(wsUrl("/ws/otra"))).rejects.toMatchObject({ status: 404 });
  });
  it("token incorrecto, ausente en el primer mensaje o tardío: cierre 4401", async () => {
    for (const first of [{ type: "hello", token: "malo" }, { type: "call", id: "1", tool: "get_canvas_state", args: {} }]) {
      const m = await openWs(wsUrl("/ws/mcp"));
      m.send(first);
      expect(await m.closed).toBe(4401);
    }
    const lazy = await openWs(wsUrl("/ws/mcp"));
    expect(await lazy.closed).toBe(4401);
    expect(s.bridge.state().mcpClients).toBe(0);
  });
  it("el token en la URL no sirve", async () => {
    const m = await openWs(`${wsUrl("/ws/mcp")}?token=${TOKEN}`);
    m.send(call("1", "get_canvas_state", {}));
    expect(await m.closed).toBe(4401);
  });
  it("mensajes malformados o binarios cierran el canal con 4400", async () => {
    const a = await mcp();
    a.send("{no es json");
    expect(await a.closed).toBe(4400);
    const b = await mcp();
    b.send(call("1", "borrar_todo", {}));
    expect(await b.closed).toBe(4400);
    const c = await mcp();
    c.ws.send(Buffer.from([1, 2, 3]));
    expect(await c.closed).toBe(4400);
  });
});

describe("canal WebSocket: autorización y reenvío", () => {
  it("sin editor: editor_disconnected/no_editor", async () => {
    const m = await mcp();
    m.send(call("1", "get_canvas_state", {}));
    expect(await m.next()).toEqual({ type: "result", id: "1", ok: false, error: { kind: "editor_disconnected", reason: "no_editor" } });
  });
  it("editor conectado pero sin proyecto autorizado: not_authorized y nada llega al editor", async () => {
    const e = await editor();
    const m = await mcp();
    m.send(call("1", "add_text_element", { projectId: "p1", expectedRevision: 0, text: "x" }));
    expect(await m.next()).toMatchObject({ ok: false, error: { kind: "editor_disconnected", reason: "not_authorized" } });
    await expect(nextCall(e, 100)).rejects.toThrow();
  });
  it("un proyecto distinto del autorizado se rechaza sin revelar el autorizado", async () => {
    const e = await editor("p1");
    const m = await mcp();
    m.send(call("1", "get_canvas_state", { projectId: "otro" }));
    const r = await m.next();
    expect(r).toEqual({ type: "result", id: "1", ok: false, error: { kind: "editor_disconnected", reason: "not_authorized" } });
    expect(JSON.stringify(r)).not.toContain("p1");
    await expect(nextCall(e, 100)).rejects.toThrow();
  });
  it("reenvía la llamada al editor (con el proyecto autorizado) y devuelve su resultado", async () => {
    const e = await editor("p1");
    const m = await mcp();
    m.send(call("a", "get_canvas_state", {}));
    const c = await nextCall(e);
    expect(c).toMatchObject({ type: "call", tool: "get_canvas_state", args: { projectId: "p1" } });
    expect(c.id).not.toBe("a");
    e.send({ type: "result", id: c.id, ok: true, data: { revision: 3 } });
    expect(await m.next()).toEqual({ type: "result", id: "a", ok: true, data: { revision: 3 } });
  });
  it("relaya los errores tipificados del editor (conflicto)", async () => {
    const e = await editor("p1");
    const m = await mcp();
    m.send(call("a", "add_text_element", { projectId: "p1", expectedRevision: 0, text: "x" }));
    const c = await nextCall(e);
    e.send({ type: "result", id: c.id, ok: false, error: { kind: "conflict", expectedRevision: 0, actualRevision: 4 } });
    expect(await m.next()).toEqual({ type: "result", id: "a", ok: false, error: { kind: "conflict", expectedRevision: 0, actualRevision: 4 } });
  });
  it("revocar la autorización corta el acceso; volver a autorizar lo restablece", async () => {
    const e = await editor("p1");
    const m = await mcp();
    e.send({ type: "revoke" });
    await tick();
    expect(s.bridge.state().authorizedProjectId).toBeNull();
    m.send(call("1", "get_canvas_state", {}));
    expect(await m.next()).toMatchObject({ error: { reason: "not_authorized" } });
    e.send({ type: "authorize", projectId: "p2" });
    await tick();
    expect(s.bridge.state().authorizedProjectId).toBe("p2");
  });
  it("argumentos que no son un objeto: invalid_params", async () => {
    await editor("p1");
    const m = await mcp();
    m.send(call("1", "get_canvas_state", [1]));
    expect(await m.next()).toMatchObject({ error: { kind: "invalid_params" } });
  });
  it("si el editor se desconecta con una llamada en curso, el cliente recibe editor_disconnected", async () => {
    const e = await editor("p1");
    const m = await mcp();
    m.send(call("1", "get_canvas_state", {}));
    await nextCall(e);
    e.ws.terminate();
    expect(await m.next()).toMatchObject({ id: "1", ok: false, error: { kind: "editor_disconnected", reason: "no_editor" } });
    expect(s.bridge.state().pending).toBe(0);
  });
  it("si el editor no responde a tiempo: timeout", async () => {
    await editor("p1");
    const m = await mcp();
    m.send(call("1", "get_canvas_state", {}));
    expect(await m.next(1500)).toMatchObject({ error: { kind: "editor_disconnected", reason: "timeout" } });
    expect(s.bridge.state().pending).toBe(0);
  });
  it("tope de llamadas pendientes: busy", async () => {
    await editor("p1");
    const m = await mcp();
    for (const id of ["1", "2", "3"]) m.send(call(id, "get_canvas_state", {}));
    expect(await m.next()).toEqual({ type: "result", id: "3", ok: false, error: { kind: "busy" } });
  });
  it("un editor nuevo sustituye al anterior (4409) y pierde su autorización", async () => {
    const old = await editor("p1");
    const fresh = await editor();
    expect(await old.closed).toBe(4409);
    expect(s.bridge.state()).toMatchObject({ editorConnected: true, authorizedProjectId: null });
    fresh.close();
  });
  it("el editor conoce cuántos clientes MCP hay conectados", async () => {
    const e = await editor("p1");
    const m = await mcp();
    expect(await e.next()).toEqual({ type: "status", mcpClients: 1 });
    m.close();
    expect(await e.next()).toEqual({ type: "status", mcpClients: 0 });
  });
  it("un resultado con id desconocido se ignora", async () => {
    const e = await editor("p1");
    e.send({ type: "result", id: "no-existe", ok: true, data: {} });
    await tick();
    expect(s.bridge.state().editorConnected).toBe(true);
  });
  it("un editor que envía mensajes inválidos es cerrado", async () => {
    const e = await editor("p1");
    e.send({ type: "call", id: "1", tool: "get_canvas_state", args: {} });
    expect(await e.closed).toBe(4400);
  });
});

describe("tope de la cola de preimpresión", () => {
  it("responde 503 busy cuando hay demasiados trabajos y no los acepta", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const calls: number[] = [];
    await s.close();
    s = await startServer({
      token: TOKEN, allowedOrigins: [ORIGIN], port: 0, maxQueue: 2,
      preflight: async () => { calls.push(1); await gate; return { report: { ok: true, checks: [], measured: { pageSizePt: null, expectedSizePt: { width: 1, height: 1 }, minPpi: 300, bytes: 1, maxInkPercent: 1, encoding: "flate" } }, pdfPath: null, proof: null, dispose: async () => undefined }; },
    });
    const post = () => fetch(`${s.url}/preflight?widthIn=1&heightIn=1`, { method: "POST", body: "x", headers: { authorization: `Bearer ${TOKEN}` } });
    const a = post();
    const b = post();
    await tick(100);
    const c = await post();
    expect(c.status).toBe(503);
    expect(await c.json()).toEqual({ error: "busy" });
    release();
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    expect(calls).toHaveLength(2);
    expect((await post()).status).toBe(200);
  });
});
