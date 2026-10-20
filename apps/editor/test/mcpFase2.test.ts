import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOLS, toolErrorSchema, type GeneratedTexture, type TextElement, type ToolOutcome } from "@free-book-cover/core";
import { FontRegistry } from "../src/fonts/fontRegistry";
import { executeTool, type ExecutorDeps } from "../src/mcp/executor";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const fakeEncode = async (t: GeneratedTexture) =>
  new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(t.widthPx), ...be32(t.heightPx), 8, 6, 0, 0, 0])], { type: "image/png" });
// TTF mínimo con fvar wght 100..900 y wdth 50..150.
function variableTtfB64(): string {
  const axes: Array<[string, number, number, number]> = [["wght", 100, 400, 900], ["wdth", 50, 100, 150]];
  const len = 16 + axes.length * 20;
  const buf = new Uint8Array(28 + len);
  const dv = new DataView(buf.buffer);
  buf.set([0, 1, 0, 0]);
  dv.setUint16(4, 1);
  buf.set([0x66, 0x76, 0x61, 0x72], 12);
  dv.setUint32(20, 28);
  dv.setUint32(24, len);
  dv.setUint16(32, 16);
  dv.setUint16(36, axes.length);
  dv.setUint16(38, 20);
  axes.forEach(([tag, min, def, max], i) => {
    const o = 44 + i * 20;
    buf.set([...tag].map((c) => c.charCodeAt(0)), o);
    dv.setInt32(o + 4, min * 65536);
    dv.setInt32(o + 8, def * 65536);
    dv.setInt32(o + 12, max * 65536);
  });
  return btoa(String.fromCharCode(...buf));
}

let n = 0;
let store: EditorStore;
let deps: ExecutorDeps;
beforeEach(async () => {
  let i = 0;
  store = createEditorStore({ storage: await openStorage(`mcp-f2-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  const id = store.getState().history.present.id;
  deps = {
    store, authorizedProjectId: () => id, measure: () => null, makeThumbnail: async () => null, encodePng: fakeEncode,
    fonts: new FontRegistry({ addFace: async () => undefined, loadCatalog: async () => true }),
  };
});
const doc = () => store.getState().history.present;
const run = (tool: Parameters<typeof executeTool>[1], args: unknown) => executeTool(deps, tool, args);
const ok = (o: ToolOutcome) => {
  if (!o.ok) throw new Error(JSON.stringify(o.error));
  return (o as { data: any }).data;
};
const err = (o: ToolOutcome) => {
  expect(o.ok).toBe(false);
  return toolErrorSchema.parse((o as { error: unknown }).error);
};
const mut = (extra: object) => ({ projectId: doc().id, expectedRevision: doc().revision, ...extra });
const text = async () => ok(await run("add_text_element", mut({ text: "LAMENTOS" }))).elementId as string;
const png = async () => ok(await run("import_asset", { projectId: doc().id, kind: "image", dataBase64: PNG_B64 })).assetId as string;

describe("MCP: acabado de letras", () => {
  it("update_element_style aplica sombra configurable, sombra interior, máscara y opacidad, y null las quita", async () => {
    const id = await text();
    const a = await png();
    const style = {
      shadow: { on: true, intensity: 60, color: "#200000", opacity: 0.9, angle: 45, distance: 0.08 },
      innerShadow: { on: true, color: "#000000", opacity: 0.6, angle: 90, distance: 0.03, blur: 0.06 },
      mask: { assetId: a, fit: "tile", tileIn: 1, mode: "alpha", threshold: 0.5 },
      opacity: 0.8,
    };
    ok(await run("update_element_style", mut({ elementId: id, style })));
    expect(doc().elements[0]).toMatchObject(style);
    ok(await run("update_element_style", mut({ elementId: id, style: { innerShadow: null, mask: null } })));
    const t = doc().elements[0] as TextElement;
    expect(t.innerShadow).toBeUndefined();
    expect(t.mask).toBeUndefined();
  });
  it("update_element_style aplica el bisel y bevel null lo quita", async () => {
    const id = await text();
    const bevel = { on: true, depth: 0.025, angle: 90, soften: 0.02, highlight: "#ffffff", highlightOpacity: 0.6, shade: "#000000", shadeOpacity: 0.5 };
    ok(await run("update_element_style", mut({ elementId: id, style: { bevel } })));
    expect((doc().elements[0] as TextElement).bevel).toEqual(bevel);
    ok(await run("update_element_style", mut({ elementId: id, style: { bevel: null } })));
    expect((doc().elements[0] as TextElement).bevel).toBeUndefined();
  });
  it("una máscara con un recurso inexistente es not_found y filtros en un texto es invalid_params", async () => {
    const id = await text();
    expect(err(await run("update_element_style", mut({ elementId: id, style: { mask: { assetId: "nope", mode: "dark", threshold: 0.4 } } })))).toMatchObject({ kind: "not_found", resource: "asset" });
    expect(err(await run("update_element_style", mut({ elementId: id, style: { filters: { blur: 10 } } }))).kind).toBe("invalid_params");
  });
  it("filtros en una imagen y en el fondo", async () => {
    const a = await png();
    const img = ok(await run("add_image_element", mut({ assetId: a }))).elementId;
    ok(await run("update_element_style", mut({ elementId: img, style: { filters: { blur: 20, brightness: 60 } } })));
    expect(doc().elements[0]).toMatchObject({ filters: { blur: 20, brightness: 60 } });
    ok(await run("update_element_style", mut({ elementId: img, style: { filters: null } })));
    expect("filters" in doc().elements[0]!).toBe(false);
    const out = ok(await run("set_background_filters", mut({ filters: { blur: 30, brightness: 50 } })));
    MCP_TOOLS.set_background_filters.output.parse(out);
    expect(doc().canvas.backgroundFilters).toEqual({ blur: 30, brightness: 50 });
    ok(await run("apply_background", mut({ assetId: a, filters: { saturation: 0 } })));
    expect(doc().canvas.backgroundFilters).toEqual({ saturation: 0 });
  });
});

describe("MCP: texturas y fuentes variables", () => {
  it("generate_texture devuelve un recurso de imagen del tamaño pedido", async () => {
    const out = ok(await run("generate_texture", mut({ kind: "cracked-marble", seed: 7, sizePx: 256 })));
    MCP_TOOLS.generate_texture.output.parse(out);
    expect(out).toMatchObject({ widthPx: 256, heightPx: 256 });
    expect(doc().assets.find((x) => x.id === out.assetId)).toMatchObject({ kind: "image", metadata: { name: "textura-cracked-marble-7.png" } });
  });
  it("import_font devuelve los ejes y stretch solo vale en fuentes subidas", async () => {
    const font = ok(await run("import_font", { projectId: doc().id, name: "RS VF.ttf", dataBase64: variableTtfB64() }));
    MCP_TOOLS.import_font.output.parse(font);
    expect(font.axes).toEqual([{ tag: "wght", min: 100, def: 400, max: 900 }, { tag: "wdth", min: 50, def: 100, max: 150 }]);
    const id = await text();
    expect(err(await run("update_element_style", mut({ elementId: id, style: { stretch: 60 } }))).kind).toBe("invalid_params");
    ok(await run("update_element_style", mut({ elementId: id, style: { fontFamily: font.family, stretch: 60, weight: 870 } })));
    expect((doc().elements[0] as TextElement).runs[0]).toMatchObject({ fontFamily: "RS VF", stretch: 60, weight: 870 });
  });
  it("cambiar a una fuente del catálogo quita la anchura, y stretch null la quita", async () => {
    const font = ok(await run("import_font", { projectId: doc().id, name: "RS VF.ttf", dataBase64: variableTtfB64() }));
    const id = await text();
    ok(await run("update_element_style", mut({ elementId: id, style: { fontFamily: font.family, stretch: 60 } })));
    ok(await run("update_element_style", mut({ elementId: id, style: { stretch: null } })));
    expect((doc().elements[0] as TextElement).runs[0]!.stretch).toBeUndefined();
    ok(await run("update_element_style", mut({ elementId: id, style: { stretch: 70 } })));
    ok(await run("update_element_style", mut({ elementId: id, style: { fontFamily: "Lora" } })));
    expect((doc().elements[0] as TextElement).runs[0]).toMatchObject({ fontFamily: "Lora" });
    expect((doc().elements[0] as TextElement).runs[0]!.stretch).toBeUndefined();
  });
});
