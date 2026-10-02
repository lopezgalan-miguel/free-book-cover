import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MCP_TOOLS, MCP_TOOL_NAMES, toolErrorSchema, type McpToolName, type ToolOutcome } from "@free-book-cover/core";
import { createMcpServer } from "../src/mcp/server.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// Error tipificado de un resultado isError: JSON en el texto y sin contenido estructurado.
const err = (r: any) => {
  expect(r.isError).toBe(true);
  expect(r.structuredContent).toBeUndefined();
  return JSON.parse(r.content[0].text).error;
};
let dir: string;
let client: Client;
const calls: { tool: McpToolName; args: any }[] = [];
let outcome: ToolOutcome = { ok: true, data: {} };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fbc-mcp-"));
  await writeFile(join(dir, "a.png"), PNG);
});
afterAll(() => rm(dir, { recursive: true, force: true }));
beforeEach(async () => {
  calls.length = 0;
  outcome = { ok: true, data: {} };
  const server = createMcpServer({
    relay: { call: async (tool, args) => { calls.push({ tool, args }); return outcome; } },
    imports: { allowedDirs: [dir], maxBytes: 1000 },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "prueba", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

const text = (r: any) => JSON.parse(r.content[0].text);

describe("servidor MCP: descubrimiento", () => {
  it("negocia la versión 2025-11-25 y declara solo herramientas", () => {
    expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-25");
    expect(client.getServerCapabilities()).toEqual({ tools: {} });
    expect(client.getServerVersion()?.name).toBe("kdp-cover-companion");
  });
  it("lista las cinco herramientas con esquemas JSON de entrada y salida", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.outputSchema?.type).toBe("object");
      expect(t.description).toBeTruthy();
    }
    const add = tools.find((t) => t.name === "add_text_element")!;
    expect(add.inputSchema.required).toEqual(expect.arrayContaining(["projectId", "expectedRevision", "text"]));
    expect(tools.find((t) => t.name === "get_canvas_state")!.annotations?.readOnlyHint).toBe(true);
    expect(add.annotations?.readOnlyHint).toBe(false);
  });
});

describe("servidor MCP: llamadas", () => {
  it("valida la entrada con zod: invalid_params tipificado, sin llamar al editor ni repetir valores", async () => {
    const r: any = await client.callTool({ name: "add_text_element", arguments: { projectId: "p", expectedRevision: -1, text: "x", color: "rojo-secreto" } });
    expect(r.isError).toBe(true);
    expect(toolErrorSchema.parse(err(r))).toMatchObject({ kind: "invalid_params" });
    expect(text(r).error.issues.join()).toContain("expectedRevision");
    expect(JSON.stringify(r)).not.toContain("rojo-secreto");
    expect(calls).toHaveLength(0);
  });
  it("una herramienta desconocida es un error de protocolo", async () => {
    await expect(client.callTool({ name: "borrar_todo", arguments: {} })).rejects.toThrow(/desconocida/);
  });
  it("reenvía la entrada validada y devuelve contenido estructurado conforme al esquema de salida", async () => {
    outcome = { ok: true, data: { elementId: "e1", revision: 2, saved: true } };
    const r: any = await client.callTool({ name: "add_text_element", arguments: { projectId: "p", expectedRevision: 1, text: "Hola" } });
    expect(r.isError).toBeFalsy();
    expect(MCP_TOOLS.add_text_element.output.parse(r.structuredContent)).toEqual({ elementId: "e1", revision: 2, saved: true });
    expect(text(r)).toEqual(r.structuredContent);
    expect(calls[0]).toEqual({ tool: "add_text_element", args: { projectId: "p", expectedRevision: 1, text: "Hola" } });
  });
  it("los errores tipificados del editor llegan como isError (conflicto, recurso ausente, desconectado)", async () => {
    for (const error of [
      { kind: "conflict", expectedRevision: 1, actualRevision: 5 },
      { kind: "not_found", resource: "asset", id: "x" },
      { kind: "editor_disconnected", reason: "no_editor" },
    ] as const) {
      outcome = { ok: false, error };
      const r: any = await client.callTool({ name: "apply_background", arguments: { projectId: "p", expectedRevision: 1, assetId: "x" } });
      expect(r.isError).toBe(true);
      expect(err(r)).toEqual(error);
    }
  });
  it("una respuesta del editor que no cumple el esquema de salida es internal, sin detalle", async () => {
    outcome = { ok: true, data: { elementId: 7 } };
    const r: any = await client.callTool({ name: "add_text_element", arguments: { projectId: "p", expectedRevision: 1, text: "x" } });
    expect(r.isError).toBe(true);
    expect(err(r)).toEqual({ kind: "internal" });
  });
  it("import_asset lee el archivo local y entrega sus bytes al editor, no la ruta", async () => {
    outcome = { ok: true, data: { assetId: "a1", revision: 3, mimeType: "image/png", widthPx: 1, heightPx: 1, sizeBytes: PNG.length, saved: true } };
    const r: any = await client.callTool({ name: "import_asset", arguments: { projectId: "p", kind: "image", path: join(dir, "a.png") } });
    expect(r.isError).toBeFalsy();
    const sent = calls[0]!.args;
    expect(sent).toEqual({ projectId: "p", kind: "image", name: "a.png", dataBase64: PNG.toString("base64") });
    expect(JSON.stringify(sent)).not.toContain(dir);
  });
  it("import_asset fuera del directorio permitido o inexistente no llega al editor", async () => {
    const out: any = await client.callTool({ name: "import_asset", arguments: { projectId: "p", kind: "image", path: "/etc/hosts" } });
    expect(err(out)).toEqual({ kind: "not_found", resource: "file" });
    const missing: any = await client.callTool({ name: "import_asset", arguments: { projectId: "p", kind: "image", path: join(dir, "nada.png") } });
    expect(err(missing)).toEqual({ kind: "not_found", resource: "file" });
    expect(calls).toHaveLength(0);
  });
});
