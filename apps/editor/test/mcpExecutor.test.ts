import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOLS, toolErrorSchema, type ToolOutcome } from "@free-book-cover/core";
import { executeTool, type ExecutorDeps } from "../src/mcp/executor";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

// PNG de 1x1.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let n = 0;
let store: EditorStore;
let storage: ProjectStorage;
let authorized: string | null;
let deps: ExecutorDeps;

beforeEach(async () => {
  storage = await openStorage(`mcp-exec-${++n}`);
  let i = 0;
  store = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  authorized = store.getState().history.present.id;
  deps = { store, authorizedProjectId: () => authorized, measure: () => null, makeThumbnail: async () => null };
});

const doc = () => store.getState().history.present;
const run = (tool: Parameters<typeof executeTool>[1], args: unknown) => executeTool(deps, tool, args);
const ok = (o: ToolOutcome) => {
  expect(o.ok).toBe(true);
  return (o as { data: any }).data;
};
const err = (o: ToolOutcome) => {
  expect(o.ok).toBe(false);
  return toolErrorSchema.parse((o as { error: unknown }).error);
};
const add = async (extra: object = {}) => ok(await run("add_text_element", { projectId: doc().id, expectedRevision: doc().revision, text: "Título", ...extra }));

describe("autorización en el editor", () => {
  it("sin proyecto autorizado o con otro distinto no se lee ni se cambia nada", async () => {
    const before = doc();
    authorized = null;
    expect(err(await run("get_canvas_state", { projectId: before.id }))).toEqual({ kind: "editor_disconnected", reason: "not_authorized" });
    authorized = "otro";
    expect(err(await run("add_text_element", { projectId: before.id, expectedRevision: 0, text: "x" }))).toEqual({ kind: "editor_disconnected", reason: "not_authorized" });
    authorized = before.id;
    expect(err(await run("add_text_element", { projectId: "otro", expectedRevision: 0, text: "x" })).kind).toBe("editor_disconnected");
    expect(doc()).toBe(before);
  });
  it("parámetros inválidos: invalid_params con rutas y sin repetir valores", async () => {
    const e = err(await run("add_text_element", { projectId: doc().id, expectedRevision: 0, text: "x", color: "rojo-secreto" }));
    expect(e.kind).toBe("invalid_params");
    expect(JSON.stringify(e)).not.toContain("rojo-secreto");
    expect(doc().revision).toBe(0);
  });
});

describe("get_canvas_state", () => {
  it("resume lienzo, elementos y recursos con la revisión vigente", async () => {
    await add({ text: "Hola" });
    const d = ok(await run("get_canvas_state", { projectId: doc().id }));
    expect(MCP_TOOLS.get_canvas_state.output.parse(d)).toMatchObject({ revision: 1, canvas: { widthIn: 6, heightIn: 9, fit: "cover" } });
    expect(d.elements[0]).toMatchObject({ type: "text", text: "Hola", fontFamily: "Lora" });
  });
});

describe("add_text_element", () => {
  it("añade el texto con los comandos de core, lo guarda y se puede deshacer", async () => {
    const out = await add({ text: "Mi libro", fontFamily: "Montserrat", fontSizePt: 48, color: "#112233", x: 1, y: 2, width: 4, align: "left" });
    MCP_TOOLS.add_text_element.output.parse(out);
    expect(out).toMatchObject({ revision: 1, saved: true });
    const el = doc().elements[0]!;
    expect(el).toMatchObject({ id: out.elementId, type: "text", x: 1, y: 2, width: 4, align: "left" });
    expect(el.type === "text" && el.runs[0]).toMatchObject({ text: "Mi libro", fontFamily: "Montserrat", fontSizePt: 48, color: "#112233" });
    expect(el.height).toBeGreaterThan(0);
    expect(store.isDirty()).toBe(false);
    store.undo();
    expect(doc().elements).toHaveLength(0);
  });
  it("revisión obsoleta: conflicto con la vigente y el documento no cambia", async () => {
    await add();
    const before = doc();
    const e = err(await run("add_text_element", { projectId: before.id, expectedRevision: 0, text: "otro" }));
    expect(e).toEqual({ kind: "conflict", expectedRevision: 0, actualRevision: 1 });
    expect(doc()).toBe(before);
    expect(store.getState().error).toBeNull();
  });
  it("fuente desconocida: invalid_params sin mutación", async () => {
    const before = doc();
    expect(err(await run("add_text_element", { projectId: before.id, expectedRevision: 0, text: "x", fontFamily: "Comic Inventada" })).kind).toBe("invalid_params");
    expect(doc()).toBe(before);
  });
  it("un fallo al guardar no deshace la edición: saved false", async () => {
    vi.spyOn(storage, "saveProject").mockRejectedValue(new Error("disco"));
    const out = await add();
    expect(out.saved).toBe(false);
    expect(doc().elements).toHaveLength(1);
  });
});

describe("update_element_style", () => {
  it("cambia el estilo de todos los fragmentos y reajusta la caja", async () => {
    const { elementId } = await add({ fontSizePt: 20, width: 2 });
    const h0 = doc().elements[0]!.height;
    const out = ok(await run("update_element_style", { projectId: doc().id, expectedRevision: doc().revision, elementId, style: { fontSizePt: 60, color: "#abcdef", shadow: { on: true, intensity: 70 } } }));
    MCP_TOOLS.update_element_style.output.parse(out);
    const el = doc().elements[0]!;
    expect(el.type === "text" && el.runs[0]).toMatchObject({ fontSizePt: 60, color: "#abcdef" });
    expect(el.type === "text" && el.shadow).toEqual({ on: true, intensity: 70 });
    expect(el.height).toBeGreaterThan(h0);
    expect(out.revision).toBe(doc().revision);
  });
  it("una propiedad que no aplica al tipo, id/zIndex o un elemento ausente no mutan", async () => {
    const { elementId } = await add();
    const before = doc();
    expect(err(await run("update_element_style", { projectId: before.id, expectedRevision: before.revision, elementId, style: { fill: "#000000" } })).kind).toBe("invalid_params");
    expect(err(await run("update_element_style", { projectId: before.id, expectedRevision: before.revision, elementId, style: { zIndex: 5 } })).kind).toBe("invalid_params");
    expect(err(await run("update_element_style", { projectId: before.id, expectedRevision: before.revision, elementId: "nada", style: { rotation: 3 } }))).toEqual({ kind: "not_found", resource: "element", id: "nada" });
    expect(err(await run("update_element_style", { projectId: before.id, expectedRevision: before.revision, elementId, style: { fontFamily: "Inventada" } })).kind).toBe("invalid_params");
    expect(doc()).toBe(before);
  });
  it("conflicto de revisión sin mutación, también si el elemento no existe", async () => {
    const { elementId } = await add();
    const before = doc();
    expect(err(await run("update_element_style", { projectId: before.id, expectedRevision: 0, elementId, style: { rotation: 10 } })).kind).toBe("conflict");
    expect(err(await run("update_element_style", { projectId: before.id, expectedRevision: 0, elementId: "nada", style: { rotation: 10 } })).kind).toBe("conflict");
    expect(doc()).toBe(before);
  });
  it("un valor que rompe el documento (comando inválido) no deja cambios parciales", async () => {
    const { elementId } = await add();
    const before = doc();
    // Esquema de core: el ancho no puede ser negativo (la entrada MCP ya lo impide; aquí se fuerza por el comando).
    const r = store.applyRemote({ type: "updateElement", id: elementId, props: { width: -1 } as never }, before.revision);
    expect(r.ok).toBe(false);
    expect(doc()).toBe(before);
  });
});

describe("import_asset", () => {
  const payload = (extra: object = {}) => ({ projectId: doc().id, kind: "image", name: "a.png", dataBase64: PNG_B64, ...extra });
  it("guarda el original como recurso del proyecto y devuelve sus metadatos", async () => {
    const out = ok(await run("import_asset", payload()));
    MCP_TOOLS.import_asset.output.parse(out);
    expect(out).toMatchObject({ mimeType: "image/png", widthPx: 1, heightPx: 1, revision: 1, saved: true });
    expect(doc().assets.map((a) => a.id)).toEqual([out.assetId]);
    expect(store.getState().assets.some((a) => a.id === out.assetId)).toBe(true);
    expect(await storage.loadLastProject()).toMatchObject({ ok: true });
  });
  it("revisión obsoleta: conflicto y nada se guarda", async () => {
    await add();
    const e = err(await run("import_asset", payload({ expectedRevision: 0 })));
    expect(e).toEqual({ kind: "conflict", expectedRevision: 0, actualRevision: 1 });
    expect(doc().assets).toHaveLength(0);
    expect(store.getState().assets).toHaveLength(0);
  });
  it("datos que no son una imagen o base64 inválido: invalid_params", async () => {
    expect(err(await run("import_asset", payload({ dataBase64: btoa("no soy una imagen") }))).kind).toBe("invalid_params");
    expect(err(await run("import_asset", payload({ dataBase64: "%%%" }))).kind).toBe("invalid_params");
    expect(doc().assets).toHaveLength(0);
    expect(doc().revision).toBe(0);
  });
});

describe("import_asset: edición intermedia", () => {
  it("si el documento cambia durante la importación: conflicto y ningún recurso queda", async () => {
    const rev = doc().revision;
    const put = storage.putAsset.bind(storage);
    vi.spyOn(storage, "putAsset").mockImplementation(async (...a) => {
      store.dispatch({ type: "setBackground", background: "#123456" });
      return put(...a);
    });
    const out = await run("import_asset", { projectId: doc().id, expectedRevision: rev, kind: "image", dataBase64: PNG_B64 });
    expect(err(out)).toEqual({ kind: "conflict", expectedRevision: rev, actualRevision: rev + 1 });
    expect(doc().assets).toHaveLength(0);
    expect(store.getState().assets).toHaveLength(0);
  });
  it("addAsset con revisión esperada obsoleta falla y retira el blob", async () => {
    const rev = doc().revision;
    store.dispatch({ type: "setBackground", background: "#123456" });
    const ok = await store.addAsset({ id: "x1", kind: "image", mimeType: "image/png", metadata: {} }, new Blob(["x"]), { expectedRevision: rev });
    expect(ok).toBe(false);
    expect(doc().assets).toHaveLength(0);
    expect(store.getState().assets.some((a) => a.id === "x1")).toBe(false);
  });
});

describe("apply_background", () => {
  it("color con fit es invalid_params y no muta", async () => {
    const before = doc();
    expect(err(await run("apply_background", { projectId: before.id, expectedRevision: before.revision, color: "#000000", fit: "fill" })).kind).toBe("invalid_params");
    expect(doc()).toBe(before);
  });
  it("color liso", async () => {
    const out = ok(await run("apply_background", { projectId: doc().id, expectedRevision: 0, color: "#204060" }));
    MCP_TOOLS.apply_background.output.parse(out);
    expect(doc().canvas.background).toBe("#204060");
    expect(out).toMatchObject({ revision: 1, saved: true });
  });
  it("recurso con política de ajuste en una sola revisión y un solo deshacer", async () => {
    const { assetId } = ok(await run("import_asset", { projectId: doc().id, kind: "image", dataBase64: PNG_B64 }));
    const out = ok(await run("apply_background", { projectId: doc().id, expectedRevision: doc().revision, assetId, fit: "contain" }));
    expect(out).toMatchObject({ revision: 2, fit: "contain", background: { assetId } });
    expect(doc().canvas.backgroundFit).toBe("contain");
    store.undo();
    expect(doc().canvas.background).toBe("#ffffff");
    expect(doc().canvas.backgroundFit).toBeUndefined();
  });
  it("recurso ausente: not_found sin mutación; revisión obsoleta: conflicto sin mutación", async () => {
    const before = doc();
    expect(err(await run("apply_background", { projectId: before.id, expectedRevision: 0, assetId: "nada" }))).toEqual({ kind: "not_found", resource: "asset", id: "nada" });
    expect(err(await run("apply_background", { projectId: before.id, expectedRevision: 9, assetId: "nada" })).kind).toBe("conflict");
    expect(err(await run("apply_background", { projectId: before.id, expectedRevision: 9, color: "#000000" })).kind).toBe("conflict");
    expect(doc()).toBe(before);
  });
  it("una fuente (no imagen) no vale como fondo", async () => {
    store.dispatch({ type: "addAsset", asset: { id: "f1", kind: "font", mimeType: "font/ttf", metadata: { family: "X" } } });
    expect(err(await run("apply_background", { projectId: doc().id, expectedRevision: doc().revision, assetId: "f1" })).kind).toBe("not_found");
  });
});

describe("las mutaciones pasan por el historial", () => {
  it("cada llamada es un paso deshacer y las revisiones no retroceden", async () => {
    await add();
    const rev = doc().revision;
    store.undo();
    expect(doc().revision).toBeGreaterThan(rev);
    const e = err(await run("add_text_element", { projectId: doc().id, expectedRevision: rev, text: "viejo" }));
    expect(e.kind).toBe("conflict");
  });
});
