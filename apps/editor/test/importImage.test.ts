import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../src/store/editorStore";
import { importImage, thumbId } from "../src/images/importImage";
import { openStorage } from "../src/storage/projectStorage";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, extra = 0) =>
  new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0]), new Uint8Array(extra)]);

let n = 0;
async function mk() {
  let i = 0;
  const storage = await openStorage(`imp-${++n}`);
  const store = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  return { store, storage };
}
const thumb = vi.fn(async () => new Blob(["t"], { type: "image/webp" }));
beforeEach(() => thumb.mockClear());

describe("importImage", () => {
  it("lee la cabecera, guarda original y miniatura aparte y coloca el fondo", async () => {
    const { store, storage } = await mk();
    const r = await importImage(store, png(1800, 2700), "background", thumb);
    expect(r).toEqual({ ok: true, assetId: "id2" });
    const doc = store.getState().history.present;
    expect(doc.canvas.background).toEqual({ assetId: "id2" });
    expect(doc.assets[0]).toMatchObject({ id: "id2", mimeType: "image/png", metadata: { widthPx: 1800, heightPx: 2700, format: "png" } });
    // la miniatura no entra en el documento y no sustituye al original
    expect(doc.assets).toHaveLength(1);
    const ids = store.getState().assets.map((a) => a.id).sort();
    expect(ids).toEqual(["id2", thumbId("id2")]);
    const original = store.getState().assets.find((a) => a.id === "id2")!;
    expect(original.blob.size).toBe(png(1800, 2700).size);
    await store.save();
    const loaded = await storage.loadLastProject();
    expect(loaded.ok && loaded.assets.map((a) => a.id).sort()).toEqual(["id2", thumbId("id2")]);
  });

  it("añade una capa de imagen con la proporción del original y la selecciona", async () => {
    const { store } = await mk();
    const r = await importImage(store, png(1000, 2000), "layer", thumb);
    expect(r.ok).toBe(true);
    const el = store.getState().history.present.elements[0]!;
    expect(el.type).toBe("image");
    expect(el.width / el.height).toBeCloseTo(0.5, 9);
    expect(el.height).toBeCloseTo(9 * 0.8, 9);
    expect(store.getState().selectedId).toBe(el.id);
  });

  it("rechaza más de 80 Mpx leyendo solo la cabecera, sin guardar nada ni decodificar", async () => {
    const { store } = await mk();
    const r = await importImage(store, png(10000, 8001), "background", thumb);
    expect(r).toEqual({ ok: false, reason: "limit" });
    expect(store.getState().error).toEqual({ kind: "limit", error: { kind: "image_too_many_megapixels", limitMegapixels: 80 } });
    expect(store.getState().assets).toHaveLength(0);
    expect(thumb).not.toHaveBeenCalled();
  });

  it("rechaza más de 100 MB", async () => {
    const { store } = await mk();
    const big = png(100, 100);
    Object.defineProperty(big, "size", { value: 100 * 1024 * 1024 + 1 });
    const r = await importImage(store, big, "layer", thumb);
    expect(r).toEqual({ ok: false, reason: "limit" });
    expect(store.getState().error).toMatchObject({ kind: "limit", error: { kind: "image_too_large" } });
  });

  it("archivo no reconocido: aviso y nada cambia", async () => {
    const { store } = await mk();
    const rev = store.getState().history.present.revision;
    const r = await importImage(store, new Blob(["no soy una imagen"]), "layer", thumb);
    expect(r).toEqual({ ok: false, reason: "unsupported" });
    expect(store.getState().error).toEqual({ kind: "unsupported_image" });
    expect(store.getState().history.present.revision).toBe(rev);
  });

  it("si la miniatura falla, el original queda igualmente importado", async () => {
    const { store } = await mk();
    const r = await importImage(store, png(300, 300), "layer", async () => null);
    expect(r.ok).toBe(true);
    expect(store.getState().assets.map((a) => a.id)).toEqual(["id2"]);
  });

  it("deshacer quita el fondo importado en un solo paso", async () => {
    const { store } = await mk();
    await importImage(store, png(300, 300), "background", thumb);
    store.undo();
    expect(store.getState().history.present.canvas.background).toBe("#ffffff");
  });
});
