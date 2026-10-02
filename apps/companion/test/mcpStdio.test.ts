import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCommand, createProject, type Project, type TextElement } from "@free-book-cover/core";
import { startServer, type CompanionServer } from "../src/server/server.js";
import { openWs, type TestWs } from "./helpers/ws.js";

const ORIGIN = "http://localhost:5199";
const TOKEN = "tok-stdio";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const MAIN = new URL("../src/mcp/main.ts", import.meta.url).pathname;
const CWD = new URL("..", import.meta.url).pathname;

// Error tipificado de un resultado isError: JSON en el texto y sin contenido estructurado.
const err = (r: any) => {
  expect(r.isError).toBe(true);
  expect(r.structuredContent).toBeUndefined();
  return JSON.parse(r.content[0].text).error;
};
let s: CompanionServer;
let dir: string;
let editor: TestWs;
let doc: Project;
const imported: { name?: string; size: number }[] = [];

// Editor simulado: ejecuta los comandos de core igual que el real, con la revisión esperada.
function simulatedEditor(ws: TestWs) {
  (async () => {
    for (;;) {
      let m: any;
      try { m = await ws.next(60_000); } catch { return; }
      if (m.type !== "call") continue;
      const reply = (ok: boolean, rest: object) => ws.send({ type: "result", id: m.id, ok, ...rest });
      const a = m.args;
      if (m.tool === "get_canvas_state") reply(true, { data: { projectId: doc.id, name: doc.name, mode: doc.mode, revision: doc.revision, canvas: { widthIn: 6, heightIn: 9, background: "#ffffff", fit: "cover" }, elements: [], assets: [] } });
      else if (m.tool === "add_text_element") {
        const el: TextElement = { id: "e1", type: "text", x: 1, y: 1, width: 4, height: 1, rotation: 0, zIndex: 0, visible: true, runs: [{ text: a.text, fontFamily: "Lora", fontSizePt: 36, weight: 500, italic: false, underline: false, uppercase: false, color: "#000000" }], align: "center", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0 };
        const r = applyCommand(doc, { type: "addElement", element: el }, a.expectedRevision);
        if (!r.ok) reply(false, { error: r.error.kind === "conflict" ? { kind: "conflict", expectedRevision: r.error.expectedRevision, actualRevision: r.error.actualRevision } : { kind: "internal" } });
        else { doc = r.doc; reply(true, { data: { elementId: "e1", revision: doc.revision, saved: true } }); }
      } else if (m.tool === "import_asset") {
        imported.push({ ...(a.name ? { name: a.name } : {}), size: Buffer.from(a.dataBase64, "base64").length });
        reply(true, { data: { assetId: "as1", revision: doc.revision, mimeType: "image/png", widthPx: 1, heightPx: 1, sizeBytes: PNG.length, saved: true } });
      } else reply(false, { error: { kind: "internal" } });
    }
  })();
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fbc-stdio-"));
  await writeFile(join(dir, "a.png"), PNG);
  s = await startServer({ token: TOKEN, allowedOrigins: [ORIGIN], port: 0 });
  doc = createProject({ id: "p1", name: "Libro" });
});
afterAll(async () => {
  editor?.ws.terminate();
  await s.close();
  await rm(dir, { recursive: true, force: true });
});

const spawnClient = async (env: Record<string, string> = {}) => {
  const transport = new StdioClientTransport({
    command: process.execPath, args: ["--import", "tsx", MAIN], cwd: CWD, stderr: "pipe",
    env: { ...(process.env as Record<string, string>), FBC_URL: s.url, FBC_TOKEN: TOKEN, FBC_IMPORT_DIRS: dir, ...env },
  });
  const client = new Client({ name: "cliente-stdio", version: "1" });
  await client.connect(transport);
  return { client, transport };
};
const call = (c: Client, name: string, args: Record<string, unknown>): Promise<any> => c.callTool({ name, arguments: args });

describe("MCP por stdio con el companion real y un editor simulado", () => {
  it("sin editor conectado, las herramientas devuelven editor_disconnected", async () => {
    const { client } = await spawnClient();
    const r = await call(client, "get_canvas_state", {});
    expect(r.isError).toBe(true);
    expect(err(r)).toEqual({ kind: "editor_disconnected", reason: "no_editor" });
    await client.close();
  });

  it("editor conectado sin autorización del usuario: editor_disconnected/not_authorized", async () => {
    editor = await openWs(`ws://127.0.0.1:${s.port}/ws/editor`, { origin: ORIGIN });
    editor.send({ type: "hello", token: TOKEN });
    await editor.next();
    const { client } = await spawnClient();
    const r = await call(client, "add_text_element", { projectId: "p1", expectedRevision: 0, text: "x" });
    expect(err(r)).toEqual({ kind: "editor_disconnected", reason: "not_authorized" });
    expect(doc.revision).toBe(0);
    await client.close();
  });

  it("autorizado: lista herramientas, añade texto, detecta conflicto sin mutar e importa un archivo", async () => {
    editor.send({ type: "authorize", projectId: "p1" });
    simulatedEditor(editor);
    const { client } = await spawnClient();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);

    const state = await call(client, "get_canvas_state", {});
    expect(state.structuredContent).toMatchObject({ projectId: "p1", revision: 0 });

    const add = await call(client, "add_text_element", { projectId: "p1", expectedRevision: 0, text: "Título" });
    expect(add.isError).toBeFalsy();
    expect(add.structuredContent).toEqual({ elementId: "e1", revision: 1, saved: true });
    expect(doc.elements).toHaveLength(1);

    const stale = await call(client, "add_text_element", { projectId: "p1", expectedRevision: 0, text: "Otro" });
    expect(stale.isError).toBe(true);
    expect(err(stale)).toEqual({ kind: "conflict", expectedRevision: 0, actualRevision: 1 });
    expect(doc.elements).toHaveLength(1);
    expect(doc.revision).toBe(1);

    const other = await call(client, "get_canvas_state", { projectId: "ajeno" });
    expect(err(other)).toEqual({ kind: "editor_disconnected", reason: "not_authorized" });

    const imp = await call(client, "import_asset", { projectId: "p1", kind: "image", path: join(dir, "a.png") });
    expect(imp.structuredContent.assetId).toBe("as1");
    expect(imported).toEqual([{ name: "a.png", size: PNG.length }]);
    const outside = await call(client, "import_asset", { projectId: "p1", kind: "image", path: "/etc/hosts" });
    expect(err(outside).kind).toBe("invalid_params");
    expect(imported).toHaveLength(1);
    await client.close();
  });

  it("dos clientes MCP simultáneos comparten el mismo editor", async () => {
    const [a, b] = await Promise.all([spawnClient(), spawnClient()]);
    const [ra, rb] = await Promise.all([call(a.client, "get_canvas_state", {}), call(b.client, "get_canvas_state", {})]);
    expect(ra.structuredContent.revision).toBe(doc.revision);
    expect(rb.structuredContent.revision).toBe(doc.revision);
    await Promise.all([a.client.close(), b.client.close()]);
  });

  it("un token incorrecto no autoriza al proceso MCP", async () => {
    const { client } = await spawnClient({ FBC_TOKEN: "otro" });
    const r = await call(client, "get_canvas_state", {});
    expect(err(r)).toEqual({ kind: "editor_disconnected", reason: "not_authorized" });
    await client.close();
  });

  it("sin companion en marcha: editor_disconnected/no_companion", async () => {
    const { client } = await spawnClient({ FBC_URL: "http://127.0.0.1:1" });
    const r = await call(client, "get_canvas_state", {});
    expect(err(r)).toEqual({ kind: "editor_disconnected", reason: "no_companion" });
    await client.close();
  });
});

// Versiones del protocolo: handshake de initialize escrito a mano (clientes anteriores a la última versión).
async function initialize(protocolVersion: string): Promise<{ protocolVersion: string; stderr: string }> {
  const child = spawn(process.execPath, ["--import", "tsx", MAIN], { cwd: CWD, env: { ...process.env, FBC_URL: s.url, FBC_TOKEN: TOKEN }, stdio: ["pipe", "pipe", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const line = new Promise<string>((resolve) => {
    let buf = "";
    child.stdout.on("data", (d) => { buf += d; const i = buf.indexOf("\n"); if (i >= 0) resolve(buf.slice(0, i)); });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "x", version: "1" } } }) + "\n");
  const res = JSON.parse(await line);
  child.kill();
  return { protocolVersion: res.result.protocolVersion, stderr: err };
}

describe("versión del protocolo MCP", () => {
  it("responde con la versión del cliente si la admite (2025-11-25 y anteriores) y con 2025-11-25 si no", async () => {
    expect((await initialize("2025-11-25")).protocolVersion).toBe("2025-11-25");
    expect((await initialize("2025-06-18")).protocolVersion).toBe("2025-06-18");
    expect((await initialize("2099-01-01")).protocolVersion).toBe("2025-11-25");
  });
  it("stdout solo lleva protocolo: el arranque no escribe nada más", async () => {
    const { stderr } = await initialize("2025-11-25");
    expect(stderr).toBe("");
  });
});
