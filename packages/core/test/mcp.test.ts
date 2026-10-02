import { describe, expect, it } from "vitest";
import {
  MCP_TOOLS, MCP_TOOL_NAMES, applyCommand, createProject, editorToServerSchema, mcpToServerSchema, serverToEditorSchema, toolErrorSchema, toolJsonSchema,
} from "../src/index.js";

describe("contrato MCP", () => {
  it("cada herramienta publica esquemas JSON de entrada y salida de tipo object", () => {
    for (const n of MCP_TOOL_NAMES) {
      expect(toolJsonSchema(n, "input")).toMatchObject({ type: "object" });
      expect(toolJsonSchema(n, "output")).toMatchObject({ type: "object" });
      expect(toolJsonSchema(n, "input")).not.toHaveProperty("$schema");
    }
    const add = toolJsonSchema("add_text_element", "input") as { required: string[]; additionalProperties: boolean };
    expect(add.required).toEqual(expect.arrayContaining(["projectId", "expectedRevision", "text"]));
    expect(add.additionalProperties).toBe(false);
  });
  it("las mutaciones exigen projectId y expectedRevision (salvo import_asset, opcional)", () => {
    expect(MCP_TOOLS.add_text_element.input.safeParse({ projectId: "p", text: "hola" }).success).toBe(false);
    expect(MCP_TOOLS.add_text_element.input.safeParse({ projectId: "p", expectedRevision: 0, text: "hola" }).success).toBe(true);
    expect(MCP_TOOLS.import_asset.input.safeParse({ projectId: "p", kind: "image", path: "/a.png" }).success).toBe(true);
    expect(MCP_TOOLS.get_canvas_state.input.safeParse({}).success).toBe(true);
  });
  it("rechaza campos desconocidos, colores y números no válidos", () => {
    const base = { projectId: "p", expectedRevision: 0, text: "x" };
    expect(MCP_TOOLS.add_text_element.input.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(MCP_TOOLS.add_text_element.input.safeParse({ ...base, color: "rojo" }).success).toBe(false);
    expect(MCP_TOOLS.add_text_element.input.safeParse({ ...base, x: Infinity }).success).toBe(false);
    expect(MCP_TOOLS.add_text_element.input.safeParse({ ...base, expectedRevision: -1 }).success).toBe(false);
    expect(MCP_TOOLS.add_text_element.input.safeParse({ ...base, expectedRevision: 1.5 }).success).toBe(false);
  });
  it("update_element_style no admite style vacío ni propiedades inmutables", () => {
    const base = { projectId: "p", expectedRevision: 1, elementId: "e" };
    expect(MCP_TOOLS.update_element_style.input.safeParse({ ...base, style: {} }).success).toBe(false);
    expect(MCP_TOOLS.update_element_style.input.safeParse({ ...base, style: { zIndex: 3 } }).success).toBe(false);
    expect(MCP_TOOLS.update_element_style.input.safeParse({ ...base, style: { id: "otro" } }).success).toBe(false);
    expect(MCP_TOOLS.update_element_style.input.safeParse({ ...base, style: { color: "#112233", shadow: { on: true, intensity: 50 } } }).success).toBe(true);
  });
  it("apply_background exige exactamente uno de assetId o color", () => {
    const base = { projectId: "p", expectedRevision: 0 };
    expect(MCP_TOOLS.apply_background.input.safeParse(base).success).toBe(false);
    expect(MCP_TOOLS.apply_background.input.safeParse({ ...base, assetId: "a", color: "#000000" }).success).toBe(false);
    expect(MCP_TOOLS.apply_background.input.safeParse({ ...base, assetId: "a", fit: "contain" }).success).toBe(true);
    expect(MCP_TOOLS.apply_background.input.safeParse({ ...base, color: "#000000" }).success).toBe(true);
  });
  it("los errores tienen cuatro tipos funcionales más busy e internal", () => {
    for (const e of [
      { kind: "invalid_params", issues: ["x"] },
      { kind: "not_found", resource: "asset", id: "a" },
      { kind: "conflict", expectedRevision: 1, actualRevision: 2 },
      { kind: "editor_disconnected", reason: "not_authorized" },
      { kind: "busy" },
      { kind: "internal" },
    ]) expect(toolErrorSchema.safeParse(e).success).toBe(true);
    expect(toolErrorSchema.safeParse({ kind: "internal", message: "ruta/secreta" }).success).toBe(false);
    expect(toolErrorSchema.safeParse({ kind: "otro" }).success).toBe(false);
  });
  it("valida los mensajes del canal en cada sentido", () => {
    expect(editorToServerSchema.safeParse({ type: "hello", token: "t" }).success).toBe(true);
    expect(editorToServerSchema.safeParse({ type: "authorize", projectId: "p" }).success).toBe(true);
    expect(editorToServerSchema.safeParse({ type: "result", id: "1", ok: true, data: {} }).success).toBe(true);
    expect(editorToServerSchema.safeParse({ type: "result", id: "1", ok: false, error: { kind: "internal" } }).success).toBe(true);
    expect(editorToServerSchema.safeParse({ type: "result", id: "1", ok: false, error: { kind: "x" } }).success).toBe(false);
    expect(editorToServerSchema.safeParse({ type: "call", id: "1", tool: "get_canvas_state" }).success).toBe(false);
    expect(mcpToServerSchema.safeParse({ type: "call", id: "1", tool: "borrar_todo", args: {} }).success).toBe(false);
    expect(mcpToServerSchema.safeParse({ type: "authorize", projectId: "p" }).success).toBe(false);
    expect(serverToEditorSchema.safeParse({ type: "call", id: "1", tool: "import_asset", args: {} }).success).toBe(true);
  });
});

describe("setBackground con encuadre", () => {
  it("fija fondo y encuadre en una sola revisión; sin fit conserva el reinicio a cover", () => {
    let doc = createProject({ id: "p" });
    doc = { ...doc, assets: [{ id: "a", kind: "image", mimeType: "image/png", metadata: {} }] };
    const r = applyCommand(doc, { type: "setBackground", background: { assetId: "a" }, fit: "contain" }, 0);
    expect(r.ok && r.doc.revision).toBe(1);
    expect(r.ok && r.doc.canvas.backgroundFit).toBe("contain");
    const r2 = applyCommand((r as { doc: typeof doc }).doc, { type: "setBackground", background: "#ffffff" }, 1);
    expect(r2.ok && r2.doc.canvas.backgroundFit).toBeUndefined();
  });
  it("un fondo con recurso inexistente no muta nada", () => {
    const doc = createProject({ id: "p" });
    const r = applyCommand(doc, { type: "setBackground", background: { assetId: "no" }, fit: "fill" }, 0);
    expect(r.ok).toBe(false);
    expect(doc.revision).toBe(0);
  });
});
