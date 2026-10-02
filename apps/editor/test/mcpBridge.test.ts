import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@free-book-cover/core";
import { createMcpBridge, type McpBridge, type SocketLike } from "../src/mcp/bridge";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: any[] = [];
  closed = false;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  constructor(public url: string) {}
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop(code: number) { this.readyState = 3; this.onclose?.({ code }); }
}

let n = 0;
let store: EditorStore;
let bridge: McpBridge;
let sockets: FakeSocket[];
const settle = () => new Promise((r) => setTimeout(r, 20));
const cfg = { baseUrl: "http://127.0.0.1:47321/", token: "tok" };

beforeEach(async () => {
  let i = 0;
  store = createEditorStore({ storage: await openStorage(`mcp-bridge-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  sockets = [];
  bridge = createMcpBridge({ store, measure: () => null, makeThumbnail: async () => null, createSocket: (u) => { const s = new FakeSocket(u); sockets.push(s); return s; }, now: () => 1000 });
});
const connected = () => {
  bridge.connect(cfg);
  sockets[0]!.open();
  sockets[0]!.receive({ type: "ready", mcpClients: 0 });
  return sockets[0]!;
};
const doc = () => store.getState().history.present;

describe("puente del editor con el companion", () => {
  it("conecta a /ws/editor y presenta el token en el primer mensaje, no en la URL", () => {
    bridge.connect(cfg);
    expect(bridge.getSnapshot().link).toBe("connecting");
    const s = sockets[0]!;
    expect(s.url).toBe("ws://127.0.0.1:47321/ws/editor");
    expect(s.url).not.toContain("tok");
    s.open();
    expect(s.sent).toEqual([{ type: "hello", token: "tok" }]);
    s.receive({ type: "ready", mcpClients: 2 });
    expect(bridge.getSnapshot()).toMatchObject({ link: "connected", mcpClients: 2, authorizedProjectId: null });
  });
  it("conectar no autoriza: sin autorización las llamadas se rechazan y no cambian nada", async () => {
    const s = connected();
    const before = doc();
    s.receive({ type: "call", id: "c1", tool: "add_text_element", args: { projectId: before.id, expectedRevision: 0, text: "x" } });
    await settle();
    expect(s.sent.at(-1)).toEqual({ type: "result", id: "c1", ok: false, error: { kind: "editor_disconnected", reason: "not_authorized" } });
    expect(doc()).toBe(before);
  });
  it("autorizar envía el proyecto abierto; la llamada se ejecuta y el resultado vuelve por el canal", async () => {
    const s = connected();
    bridge.authorize();
    expect(s.sent.at(-1)).toEqual({ type: "authorize", projectId: doc().id });
    expect(bridge.getSnapshot().authorizedProjectId).toBe(doc().id);
    s.receive({ type: "call", id: "c1", tool: "add_text_element", args: { projectId: doc().id, expectedRevision: 0, text: "Hola" } });
    await settle();
    const res = s.sent.at(-1);
    expect(res).toMatchObject({ type: "result", id: "c1", ok: true, data: { revision: 1, saved: true } });
    expect(doc().elements).toHaveLength(1);
    expect(bridge.getSnapshot().activity[0]).toEqual({ tool: "add_text_element", ok: true, at: 1000 });
  });
  it("conflicto: error tipificado y el documento no cambia", async () => {
    const s = connected();
    bridge.authorize();
    s.receive({ type: "call", id: "a", tool: "add_text_element", args: { projectId: doc().id, expectedRevision: 0, text: "uno" } });
    s.receive({ type: "call", id: "b", tool: "add_text_element", args: { projectId: doc().id, expectedRevision: 0, text: "dos" } });
    await settle();
    // Las llamadas se ejecutan en orden: la segunda ya ve la revisión 1.
    expect(s.sent.filter((m) => m.type === "result")).toEqual([
      expect.objectContaining({ id: "a", ok: true }),
      { type: "result", id: "b", ok: false, error: { kind: "conflict", expectedRevision: 0, actualRevision: 1 } },
    ]);
    expect(doc().elements).toHaveLength(1);
    expect(bridge.getSnapshot().activity[0]).toMatchObject({ ok: false, errorKind: "conflict" });
  });
  it("revocar corta el acceso y lo avisa al companion", async () => {
    const s = connected();
    bridge.authorize();
    bridge.revoke();
    expect(s.sent.at(-1)).toEqual({ type: "revoke" });
    s.receive({ type: "call", id: "c", tool: "get_canvas_state", args: { projectId: doc().id } });
    await settle();
    expect(s.sent.at(-1)).toMatchObject({ ok: false, error: { reason: "not_authorized" } });
  });
  it("la autorización caduca si cambia el proyecto abierto", async () => {
    const storage = await openStorage(`mcp-bridge-swap${n}`);
    await storage.saveProject(createProject({ id: "guardado" }));
    let i = 0;
    const fresh = createEditorStore({ storage, newId: () => `nuevo${++i}`, downloadParts: vi.fn() });
    const socks: FakeSocket[] = [];
    const b = createMcpBridge({ store: fresh, measure: () => null, createSocket: (u) => { const x = new FakeSocket(u); socks.push(x); return x; } });
    b.connect(cfg);
    socks[0]!.open();
    socks[0]!.receive({ type: "ready", mcpClients: 0 });
    b.authorize();
    expect(b.getSnapshot().authorizedProjectId).toBe("nuevo1");
    // Se recupera el proyecto guardado: el autorizado ya no es el abierto.
    await fresh.init();
    expect(fresh.getState().history.present.id).toBe("guardado");
    expect(b.getSnapshot().authorizedProjectId).toBeNull();
    expect(socks[0]!.sent.at(-1)).toEqual({ type: "revoke" });
  });
  it("no se puede autorizar sin conexión", () => {
    bridge.authorize();
    expect(bridge.getSnapshot().authorizedProjectId).toBeNull();
    expect(sockets).toHaveLength(0);
  });
  it("cierres del companion: token rechazado, sustituido, protocolo e inalcanzable", () => {
    for (const [code, failure] of [[4401, "unauthorized"], [4409, "replaced"], [4400, "protocol"], [1006, "unreachable"]] as const) {
      sockets.length = 0;
      const s = connected();
      bridge.authorize();
      s.drop(code);
      expect(bridge.getSnapshot()).toMatchObject({ link: "failed", failure, authorizedProjectId: null, mcpClients: 0 });
      bridge.disconnect();
    }
  });
  it("un error al crear el socket deja el enlace en fallo", () => {
    const b = createMcpBridge({ store, measure: () => null, createSocket: () => { throw new Error("x"); } });
    b.connect(cfg);
    expect(b.getSnapshot()).toMatchObject({ link: "failed", failure: "unreachable" });
  });
  it("status actualiza los clientes MCP; mensajes inválidos se ignoran", () => {
    const s = connected();
    s.receive({ type: "status", mcpClients: 3 });
    s.receive({ type: "call", id: "x", tool: "borrar", args: {} });
    s.receive("basura");
    s.onmessage?.({ data: "no json" });
    expect(bridge.getSnapshot().mcpClients).toBe(3);
    expect(s.sent).toHaveLength(1);
  });
  it("desconectar cierra el canal y borra la autorización", () => {
    const s = connected();
    bridge.authorize();
    bridge.disconnect();
    expect(s.closed).toBe(true);
    expect(bridge.getSnapshot()).toMatchObject({ link: "off", authorizedProjectId: null });
  });
  it("notifica a los suscriptores", () => {
    const l = vi.fn();
    const off = bridge.subscribe(l);
    connected();
    expect(l).toHaveBeenCalled();
    off();
  });
});
