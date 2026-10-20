import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
let exportDir: string;
let client: Client;
const calls: { tool: McpToolName; args: any }[] = [];
let outcome: ToolOutcome = { ok: true, data: {} };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fbc-mcp-"));
  await writeFile(join(dir, "a.png"), PNG);
  await writeFile(join(dir, "f.ttf"), Buffer.from([0, 1, 0, 0, 1, 2, 3, 4]));
  exportDir = await mkdtemp(join(tmpdir(), "fbc-exp-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(exportDir, { recursive: true, force: true });
});
beforeEach(async () => {
  calls.length = 0;
  outcome = { ok: true, data: {} };
  const server = createMcpServer({
    relay: { call: async (tool, args) => { calls.push({ tool, args }); return outcome; } },
    imports: { allowedDirs: [dir], maxBytes: 1000 },
    exportDir,
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
    expect(add.inputSchema.required).toEqual(expect.arrayContaining(["projectId", "expectedRevision"]));
    expect(tools.find((t) => t.name === "get_canvas_state")!.annotations?.readOnlyHint).toBe(true);
    expect(add.annotations?.readOnlyHint).toBe(false);
  });
  it("gestión: renombrar, borrar y reordenar; solo remove_element es destructiva", async () => {
    const { tools } = await client.listTools();
    for (const name of ["rename_project", "remove_element", "reorder_element"]) expect(tools.map((t) => t.name)).toContain(name);
    expect(tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name)).toEqual(["remove_element"]);
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

describe("servidor MCP: fuentes y exportación", () => {
  it("import_font lee la fuente local y entrega sus bytes y nombre al editor", async () => {
    outcome = { ok: true, data: { assetId: "f1", family: "f", revision: 2, sizeBytes: 8, axes: null, saved: true } };
    const r: any = await client.callTool({ name: "import_font", arguments: { projectId: "p", path: join(dir, "f.ttf") } });
    expect(r.isError).toBeFalsy();
    expect(calls[0]).toEqual({ tool: "import_font", args: { projectId: "p", name: "f.ttf", dataBase64: Buffer.from([0, 1, 0, 0, 1, 2, 3, 4]).toString("base64") } });
    const notFont: any = await client.callTool({ name: "import_font", arguments: { projectId: "p", path: join(dir, "a.png") } });
    expect(err(notFont).kind).toBe("invalid_params");
  });
  it("export_image escribe el archivo del editor en el directorio de exportación y devuelve la ruta", async () => {
    outcome = { ok: true, data: { fileName: "portada-base-1x1.png", format: "png", mimeType: "image/png", widthPx: 1, heightPx: 1, bytes: PNG.length, dataBase64: PNG.toString("base64") } };
    const r: any = await client.callTool({ name: "export_image", arguments: { projectId: "p", format: "png" } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({ path: join(exportDir, "portada-base-1x1.png"), fileName: "portada-base-1x1.png", format: "png", widthPx: 1, heightPx: 1, bytes: PNG.length });
    expect(await readFile(join(exportDir, "portada-base-1x1.png"))).toEqual(PNG);
    expect(JSON.stringify(r.structuredContent)).not.toContain("dataBase64");
  });
});

describe("servidor MCP: export_kdp_pdf", () => {
  const editorOut = (over: object = {}) => ({
    state: "ready", fileName: "mi-libro-kdp-3743x2775.pdf", pdfBase64: Buffer.from("%PDF-1.4").toString("base64"), reportFileName: "mi-libro-kdp-3743x2775-informe-preimpresion.txt",
    reportText: "Informe", checks: [{ id: "size", status: "pass" }], widthIn: 12.5, heightIn: 9.25, ...over,
  });
  it("sin exportDir: error sin llamar al editor", async () => {
    const server = createMcpServer({ relay: { call: async (tool, args) => { calls.push({ tool, args }); return outcome; } }, imports: { allowedDirs: [dir], maxBytes: 1000 } });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "prueba", version: "1" });
    await Promise.all([server.connect(a), c.connect(b)]);
    const r: any = await c.callTool({ name: "export_kdp_pdf", arguments: { projectId: "p" } });
    expect(err(r).kind).toBe("invalid_params");
    expect(calls).toHaveLength(0);
  });
  it("escribe el PDF y el informe y devuelve sus rutas", async () => {
    outcome = { ok: true, data: editorOut() };
    const r: any = await client.callTool({ name: "export_kdp_pdf", arguments: { projectId: "p" } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      state: "ready", path: join(exportDir, "mi-libro-kdp-3743x2775.pdf"), reportPath: join(exportDir, "mi-libro-kdp-3743x2775-informe-preimpresion.txt"),
      checks: [{ id: "size", status: "pass" }], widthIn: 12.5, heightIn: 9.25,
    });
    expect((await readFile(r.structuredContent.path)).toString()).toBe("%PDF-1.4");
    expect(await readFile(r.structuredContent.reportPath, "utf8")).toBe("Informe");
  });
  it("sin PDF (entrada rechazada): path null y el informe escrito", async () => {
    outcome = { ok: true, data: editorOut({ state: "not_validated", fileName: "rechazado.pdf", pdfBase64: null, reportFileName: "rechazado-informe.txt" }) };
    const r: any = await client.callTool({ name: "export_kdp_pdf", arguments: { projectId: "p" } });
    expect(r.structuredContent).toMatchObject({ state: "not_validated", path: null, reportPath: join(exportDir, "rechazado-informe.txt") });
    expect(await readFile(join(exportDir, "rechazado-informe.txt"), "utf8")).toBe("Informe");
  });
});
