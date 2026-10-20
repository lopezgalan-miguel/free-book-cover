import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_EXPORT_BYTES, MCP_TOOLS, exportImageEditorOutput, toolErrorSchema, type TextElement, type ToolOutcome } from "@free-book-cover/core";
import type { ExportDeps } from "../src/export/exportImage";
import { FontRegistry } from "../src/fonts/fontRegistry";
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

// ---------------------------------------------------------------- herramientas de portada (fase 1)

const TTF_B64 = btoa(String.fromCharCode(0, 1, 0, 0, 1, 2, 3, 4));
const withFonts = () => {
  const fonts = new FontRegistry({ addFace: async () => undefined, loadCatalog: async () => true });
  deps = { ...deps, fonts };
  return fonts;
};
const importPng = async () => ok(await run("import_asset", { projectId: doc().id, kind: "image", dataBase64: PNG_B64 })).assetId as string;
const mut = (extra: object) => ({ projectId: doc().id, expectedRevision: doc().revision, ...extra });

describe("caras de fuente inexistentes", () => {
  it("add_text_element y update_element_style rechazan una cara que la familia no publica", async () => {
    // EB Garamond solo tiene cursiva 400: pedir 500 cursiva explícitamente se rechaza.
    const e = err(await run("add_text_element", mut({ text: "x", fontFamily: "EB Garamond", italic: true, weight: 500 })));
    expect(e.kind).toBe("invalid_params");
    expect(JSON.stringify(e)).toContain("EB Garamond");
    expect(doc().elements).toHaveLength(0);
    // Sin peso se usa la cara publicada más próxima al peso por defecto.
    ok(await run("add_text_element", mut({ text: "x", fontFamily: "EB Garamond", italic: true })));
    expect((doc().elements[0] as TextElement).runs[0]).toMatchObject({ weight: 400, italic: true });
    ok(await run("add_text_element", mut({ text: "y", fontFamily: "Georgia" })));
    expect((doc().elements[1] as TextElement).runs[0]!.weight).toBe(400);
    const id = doc().elements[0]!.id;
    expect(err(await run("update_element_style", mut({ elementId: id, style: { weight: 700 } }))).kind).toBe("invalid_params");
    // Las fuentes subidas no tienen cursiva, pero cubren cualquier peso.
    withFonts();
    ok(await run("import_font", { projectId: doc().id, name: "Mía.ttf", dataBase64: TTF_B64 }));
    ok(await run("update_element_style", mut({ elementId: id, style: { fontFamily: "Mía", italic: false, weight: 900 } })));
  });
});

describe("update_element_style: anchura, textura y recorte", () => {
  it("aplica anchura y textura en mosaico; null quita la textura", async () => {
    const tex = await importPng();
    const { elementId } = await add();
    ok(await run("update_element_style", mut({ elementId, style: { scaleX: 0.8, texture: { assetId: tex, fit: "tile", tileIn: 1.5 } } })));
    expect(doc().elements[0]).toMatchObject({ scaleX: 0.8, texture: { assetId: tex, fit: "tile", tileIn: 1.5 } });
    ok(await run("update_element_style", mut({ elementId, style: { texture: null } })));
    expect("texture" in doc().elements[0]!).toBe(false);
  });
  it("scaleX ensancha la caja con las letras y conserva el centro, salvo que se indique width o x", async () => {
    withFonts();
    const { elementId } = await add();
    const el0 = doc().elements[0]!;
    const center = el0.x + el0.width / 2;
    ok(await run("update_element_style", mut({ elementId, style: { scaleX: 1.2 } })));
    const el1 = doc().elements[0]!;
    expect(el1.width).toBeCloseTo(el0.width * 1.2);
    expect(el1.x + el1.width / 2).toBeCloseTo(center);
    ok(await run("update_element_style", mut({ elementId, style: { scaleX: 0.6, width: 2, x: 0.25 } })));
    expect(doc().elements[0]).toMatchObject({ scaleX: 0.6, width: 2, x: 0.25 });
  });
  it("una textura con recurso inexistente o que no es imagen no cambia nada", async () => {
    withFonts();
    const { elementId } = await add();
    const before = doc();
    expect(err(await run("update_element_style", mut({ elementId, style: { texture: { assetId: "nope" } } })))).toEqual({ kind: "not_found", resource: "asset", id: "nope" });
    const font = ok(await run("import_font", { projectId: doc().id, name: "F.ttf", dataBase64: TTF_B64 })).assetId;
    expect(err(await run("update_element_style", mut({ elementId, style: { texture: { assetId: font } } }))).kind).toBe("not_found");
    expect(doc().elements).toEqual(before.elements);
  });
});

describe("import_font", () => {
  it("registra la fuente, la guarda como recurso y se puede usar en fontFamily", async () => {
    withFonts();
    const out = ok(await run("import_font", { projectId: doc().id, name: "Mi Fuente.ttf", dataBase64: TTF_B64 }));
    MCP_TOOLS.import_font.output.parse(out);
    expect(out).toMatchObject({ family: "Mi Fuente", saved: true });
    expect(doc().assets.find((a) => a.id === out.assetId)).toMatchObject({ kind: "font", metadata: { family: "Mi Fuente" } });
    await add({ fontFamily: "Mi Fuente" });
    expect((doc().elements[0] as TextElement).runs[0]!.fontFamily).toBe("Mi Fuente");
  });
  it("formato no admitido, revisión obsoleta o sin registro de fuentes: error y sin recurso", async () => {
    expect(err(await run("import_font", { projectId: doc().id, name: "F.ttf", dataBase64: TTF_B64 })).kind).toBe("internal");
    withFonts();
    expect(err(await run("import_font", { projectId: doc().id, name: "F.ttf", dataBase64: btoa("no es una fuente") })).kind).toBe("invalid_params");
    expect(err(await run("import_font", { projectId: doc().id, expectedRevision: 7, name: "F.ttf", dataBase64: TTF_B64 })).kind).toBe("conflict");
    expect(doc().assets).toHaveLength(0);
  });
});

describe("add_image_element y add_shape_element", () => {
  it("añade una capa de imagen con caja por defecto o la indicada", async () => {
    const a = await importPng();
    const first = ok(await run("add_image_element", mut({ assetId: a })));
    MCP_TOOLS.add_image_element.output.parse(first);
    // PNG 1×1 en lienzo 6×9: cuadrado al 80 % del ancho, centrado.
    const img = doc().elements.find((e) => e.id === first.elementId)!;
    expect(img).toMatchObject({ type: "image", fit: "cover" });
    expect([img.x, img.y, img.width, img.height].map((v) => +v.toFixed(9))).toEqual([0.6, 2.1, 4.8, 4.8]);
    const second = ok(await run("add_image_element", mut({ assetId: a, x: 0, y: 0, width: 6, height: 9, fit: "contain", crop: { x: 0, y: 0, width: 1, height: 0.5 } })));
    expect(doc().elements.find((e) => e.id === second.elementId)).toMatchObject({ x: 0, y: 0, width: 6, height: 9, fit: "contain", crop: { height: 0.5 } });
    expect(err(await run("add_image_element", mut({ assetId: "nope" })))).toEqual({ kind: "not_found", resource: "asset", id: "nope" });
  });
  it("añade una forma", async () => {
    const out = ok(await run("add_shape_element", mut({ shape: "rect", x: 1, y: 0, width: 0.3, height: 9, fill: "#0b0203" })));
    expect(doc().elements.find((e) => e.id === out.elementId)).toMatchObject({ type: "shape", shape: "rect", fill: "#0b0203", width: 0.3 });
  });
});

describe("variantes por MCP", () => {
  it("añade una variante de preajuste y la ajusta en un solo paso", async () => {
    const { elementId } = await add({ y: 0 });
    const v = ok(await run("add_variant", mut({ presetId: "instagram-feed-portrait" })));
    MCP_TOOLS.add_variant.output.parse(v);
    expect(v).toMatchObject({ widthPx: 1080, heightPx: 1350 });
    const rev = doc().revision;
    const u = ok(await run("update_variant", mut({ targetId: v.targetId, view: { y: 0 }, elements: { [elementId]: { fontScale: 0.9 } } })));
    MCP_TOOLS.update_variant.output.parse(u);
    expect(doc().revision).toBe(rev + 1);
    expect(u.visibleArea).toMatchObject({ y: 0, width: 6 });
    expect(err(await run("update_variant", mut({ targetId: "nope", view: { y: 0 } })))).toEqual({ kind: "not_found", resource: "variant", id: "nope" });
  });
  it("tamaño propio", async () => {
    const v = ok(await run("add_variant", mut({ presetId: "custom", widthPx: 1000, heightPx: 1000, name: "Cuadrado" })));
    expect(doc().digitalTargets!.find((t) => t.id === v.targetId)).toMatchObject({ name: "Cuadrado", widthPx: 1000, heightPx: 1000 });
  });
});

describe("set_canvas", () => {
  it("cambia el tamaño del lienzo libre en un solo paso", async () => {
    const rev = doc().revision;
    const out = ok(await run("set_canvas", mut({ widthIn: 1600 / 300, heightIn: 2560 / 300 })));
    MCP_TOOLS.set_canvas.output.parse(out);
    expect(doc().canvas).toMatchObject({ widthIn: 1600 / 300, heightIn: 2560 / 300 });
    expect(doc().revision).toBe(rev + 1);
  });
  it("en una cubierta KDP el tamaño lo fija la configuración de impresión", async () => {
    ok(await run("set_print_setup", mut({ trimWidthIn: 5, trimHeightIn: 8, pageCount: 132, paperAndInk: "bw-white" })));
    expect(err(await run("set_canvas", mut({ widthIn: 5, heightIn: 8 }))).kind).toBe("invalid_params");
  });
});

describe("set_print_setup", () => {
  it("configura la cubierta KDP y devuelve la geometría", async () => {
    const out = ok(await run("set_print_setup", mut({ trimWidthIn: 5, trimHeightIn: 8, pageCount: 132, paperAndInk: "bw-white" })));
    MCP_TOOLS.set_print_setup.output.parse(out);
    expect(doc().mode).toBe("kdp-paperback");
    expect(out.spineIn).toBeCloseTo(0.297264, 6);
    expect(out.canvas.widthIn).toBeCloseTo(10.547264, 6);
    expect(out.front.x).toBeCloseTo(5.422264, 6);
  });
  it("tapa dura: binding, bisagras y lienzo de la plantilla oficial", async () => {
    const out = ok(await run("set_print_setup", mut({ trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream", binding: "hardcover" })));
    MCP_TOOLS.set_print_setup.output.parse(out);
    expect(out.binding).toBe("hardcover");
    expect(out.canvas.widthIn).toBeCloseTo(939.8721 / 72, 5);
    expect(out.hinges[0]).toBeCloseTo(424.3464 / 72, 5);
    expect(doc().printSetup?.binding).toBe("hardcover");
  });
  it("tapa dura con una imagen por debajo de 300 ppp es invalid_params con la imagen y sus ppp", async () => {
    const { assetId } = ok(await run("import_asset", { projectId: doc().id, kind: "image", dataBase64: PNG_B64 }));
    ok(await run("apply_background", mut({ assetId })));
    const before = doc();
    const e = err(await run("set_print_setup", mut({ trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream", binding: "hardcover" })));
    if (e.kind !== "invalid_params") throw new Error(e.kind);
    expect(e.issues.join(" ")).toMatch(/background: \d+ ppp.*300/);
    expect(doc()).toBe(before);
  });
  it("un corte no admitido es invalid_params y no cambia nada", async () => {
    const before = doc();
    expect(err(await run("set_print_setup", mut({ trimWidthIn: 7, trimHeightIn: 9, pageCount: 116, paperAndInk: "bw-white" }))).kind).toBe("invalid_params");
    expect(doc()).toBe(before);
  });
});

describe("export_image", () => {
  const exportDeps = (bytes = 10): ExportDeps => ({
    fonts: { ensureDoc: () => undefined, whenSettled: async () => undefined, checkFontsReady: () => ({ ok: true }) },
    missingAssets: () => [],
    render: async (_d, size) => size,
    encode: async (_c, mimeType) => new Blob([new Uint8Array(bytes)], { type: mimeType }),
  });
  it("exporta el base a 300 ppp y devuelve los bytes y el nombre", async () => {
    deps = { ...deps, exportDeps: () => exportDeps() };
    const out = ok(await run("export_image", { projectId: doc().id, format: "png" }));
    expect(exportImageEditorOutput.parse(out)).toMatchObject({ format: "png", widthPx: 1800, heightPx: 2700, bytes: 10 });
    expect(out.fileName).toMatch(/1800x2700\.png$/);
    expect(atob(out.dataBase64)).toHaveLength(10);
  });
  it("exporta una variante con sus píxeles; destino inexistente o sin exportador da error", async () => {
    expect(err(await run("export_image", { projectId: doc().id, format: "png" })).kind).toBe("internal");
    deps = { ...deps, exportDeps: () => exportDeps() };
    const v = ok(await run("add_variant", mut({ presetId: "instagram-feed-square" })));
    expect(ok(await run("export_image", { projectId: doc().id, format: "jpeg", target: v.targetId }))).toMatchObject({ widthPx: 1080, heightPx: 1080, format: "jpeg" });
    expect(err(await run("export_image", { projectId: doc().id, format: "png", target: "nope" }))).toEqual({ kind: "not_found", resource: "variant", id: "nope" });
    // Un formato que el destino no admite (WebP en Instagram) se rechaza.
    expect(err(await run("export_image", { projectId: doc().id, format: "webp", target: v.targetId })).kind).toBe("invalid_params");
  });
  it("un archivo mayor que el límite del canal se rechaza con un motivo", async () => {
    deps = { ...deps, exportDeps: () => exportDeps(MAX_EXPORT_BYTES + 1) };
    expect(err(await run("export_image", { projectId: doc().id, format: "png" })).kind).toBe("invalid_params");
  });
});
