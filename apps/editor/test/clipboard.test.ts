import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset, TextElement } from "@free-book-cover/core";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

// Copiar, pegar y duplicar capas (U-04): el portapapeles vive en el almacén y sobrevive al cambio de proyecto.
let n = 0;
let storage: ProjectStorage;
const mk = (st: ProjectStorage = storage): EditorStore => {
  let i = 0;
  return createEditorStore({ storage: st, newId: () => `id${++i}`, downloadParts: vi.fn() });
};
const text = (id: string, extra: Partial<TextElement> = {}): TextElement => ({
  id, type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
  align: "center", lineHeight: 1.2, letterSpacing: 0.02,
  shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0, ...extra,
});
const tex: Asset = { id: "tx", kind: "image", mimeType: "image/png", metadata: {} };
const els = (s: EditorStore) => s.getState().history.present.elements;

// Proyecto con un texto texturado seleccionado (blobs tx y tx.thumb).
async function withTexture(s: EditorStore) {
  await s.init();
  await s.addAsset(tex, new Blob(["tex"]));
  await s.addDerivedBlob("tx.thumb", new Blob(["th"]));
  s.dispatch({ type: "addElement", element: text("t", { texture: { assetId: "tx" } }) });
  s.select("t");
}

beforeEach(async () => {
  storage = await openStorage(`clip-db-${++n}`);
});

describe("portapapeles de capas", () => {
  it("pega en otro proyecto con id nuevo, recurso y miniatura, en un solo paso", async () => {
    const s = mk();
    await withTexture(s);
    expect(s.canPaste()).toBe(false);
    expect(s.copySelection()).toBe(true);
    expect(s.canPaste()).toBe(true);
    await s.newProject();
    const b = s.getState().history.present.id;
    expect(await s.paste()).toBe(true);
    expect(els(s)).toHaveLength(1);
    expect(els(s)[0]!.id).not.toBe("t");
    expect(s.getState().history.present.assets.map((a) => a.id)).toEqual(["tx"]);
    expect(await storage.listAssetIds(b)).toEqual(expect.arrayContaining(["tx", "tx.thumb"]));
    expect(s.getState().selectedId).toBe(els(s)[0]!.id);
    s.undo();
    expect(els(s)).toHaveLength(0);
    expect(s.getState().history.present.assets).toHaveLength(0);
    expect(s.canUndo()).toBe(false);
  });
  it("pegar dos veces en el mismo proyecto desplaza 0,125 in y no reescribe blobs", async () => {
    const s = mk();
    await withTexture(s);
    s.copySelection();
    const put = vi.spyOn(storage, "putAsset");
    await s.paste();
    await s.paste();
    expect(put).not.toHaveBeenCalled();
    expect(els(s)).toHaveLength(3);
    expect(els(s)[1]).toMatchObject({ x: 1.125, y: 1.125 });
    expect(els(s)[2]).toMatchObject({ x: 1.125, y: 1.125 });
  });
  it("copia el elemento del base aunque una variante lo mueva", async () => {
    const s = mk();
    await s.init();
    s.dispatch({ type: "addElement", element: text("t") });
    s.dispatch({
      type: "addDigitalTarget",
      target: { id: "v1", presetId: "instagram-feed-portrait", presetVersion: 1, widthPx: 1080, heightPx: 1350, layoutOverrides: {} },
    });
    s.setActiveVariant("v1");
    s.dispatch({ type: "setVariantElement", targetId: "v1", elementId: "t", props: { x: 2 } });
    s.select("t");
    expect(s.copySelection()).toBe(true);
    await s.newProject();
    await s.paste();
    expect(els(s)[0]!.x).toBe(1);
  });
  it("si un blob falla, no cambia el documento y se borra lo escrito", async () => {
    let calls = -1;
    const failing: ProjectStorage = {
      ...storage,
      putAsset: async (p, id, b) => (calls >= 0 && ++calls === 2 ? { ok: false as const, kind: "quota" as const, message: "" } : storage.putAsset(p, id, b)),
    };
    const s = mk(failing);
    await withTexture(s);
    s.copySelection();
    await s.newProject();
    const b = s.getState().history.present.id;
    const rev = s.getState().history.present.revision;
    calls = 0;
    expect(await s.paste()).toBe(false);
    expect(s.getState().history.present.revision).toBe(rev);
    expect(els(s)).toHaveLength(0);
    expect(s.getState().assets).toHaveLength(0);
    expect(await storage.listAssetIds(b)).toEqual([]);
    expect(s.getState().error).toEqual({ kind: "quota" });
  });
  it("duplicateSelection no cambia lo que pega un paste posterior", async () => {
    const s = mk();
    await withTexture(s);
    s.dispatch({ type: "addElement", element: text("u", { x: 2, zIndex: 1 }) });
    s.select("t");
    s.copySelection();
    s.select("u");
    expect(await s.duplicateSelection()).toBe(true);
    expect(els(s)).toHaveLength(3);
    await s.paste();
    expect(els(s)).toHaveLength(4);
    expect(els(s)[3]).toMatchObject({ x: 1.125, y: 1.125, texture: { assetId: "tx" } });
  });
});

// Rondas de la revisión final: cambio de proyecto a mitad de pegado, blobs ya presentes, purga, fuentes y recursos compartidos.
const MB = 1024 * 1024;
// Blob pequeño que declara un tamaño grande: prueba los límites sin reservar memoria.
const fake = (mb: number) => Object.defineProperty(new Blob(["x"]), "size", { value: mb * MB });
const ids = (s: EditorStore) => s.getState().assets.map((a) => a.id).sort();

describe("pegado seguro", () => {
  it("si el proyecto cambia mientras se escribe un blob, no se pega y no queda nada en ninguno", async () => {
    let armed = false;
    let s!: EditorStore;
    const slow: ProjectStorage = {
      ...storage,
      putAsset: async (p, id, b) => {
        if (armed) {
          armed = false;
          await s.newProject();
        }
        return storage.putAsset(p, id, b);
      },
    };
    s = mk(slow);
    await withTexture(s);
    s.copySelection();
    await s.newProject();
    const b = s.getState().history.present.id;
    armed = true;
    expect(await s.paste()).toBe(false);
    const c = s.getState().history.present.id;
    expect(c).not.toBe(b);
    expect(els(s)).toHaveLength(0);
    expect(s.getState().history.present.assets).toHaveLength(0);
    expect(s.getState().assets).toHaveLength(0);
    expect(await storage.listAssetIds(b)).toEqual([]);
    expect(await storage.listAssetIds(c)).toEqual([]);
  });
  it("deshacer y pegar otra vez no reescribe blobs que ya están y un fallo no borra los existentes", async () => {
    let fail = false;
    const flaky: ProjectStorage = { ...storage, putAsset: async (p, id, b) => (fail ? { ok: false as const, kind: "quota" as const, message: "" } : storage.putAsset(p, id, b)) };
    const s = mk(flaky);
    await withTexture(s);
    s.copySelection();
    await s.newProject();
    const b = s.getState().history.present.id;
    await s.paste();
    s.undo();
    fail = true;
    const put = vi.spyOn(flaky, "putAsset");
    expect(await s.paste()).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(await storage.listAssetIds(b)).toEqual(expect.arrayContaining(["tx", "tx.thumb"]));
    expect(ids(s)).toEqual(["tx", "tx.thumb"]);
  });
  it("antes de rechazar por tamaño purga los blobs huérfanos y reintenta", async () => {
    const mem: ProjectStorage = { ...storage, putAsset: async () => ({ ok: true as const }), deleteAsset: async () => undefined };
    const s = mk(mem);
    await s.init();
    await s.addAsset(tex, fake(90));
    s.dispatch({ type: "addElement", element: text("t", { texture: { assetId: "tx" } }) });
    s.select("t");
    s.copySelection();
    await s.newProject();
    // 420 MB sin ninguna referencia en el historial: 420 + 90 superaría los 500 MB.
    await s.addDerivedBlob("viejo", fake(420));
    expect(ids(s)).toEqual(["viejo"]);
    expect(await s.paste()).toBe(true);
    expect(ids(s)).toEqual(["tx"]);
    expect(s.getState().error).toBeNull();
    expect(s.getState().nearLimit).toBe(false);
  });
  it("avisa de proyecto casi lleno tras pegar", async () => {
    const mem: ProjectStorage = { ...storage, putAsset: async () => ({ ok: true as const }), deleteAsset: async () => undefined };
    const s = mk(mem);
    await s.init();
    await s.addAsset(tex, fake(90));
    s.dispatch({ type: "addElement", element: text("t", { texture: { assetId: "tx" } }) });
    s.select("t");
    s.copySelection();
    await s.newProject();
    await s.addAsset({ id: "otro", kind: "image", mimeType: "image/png", metadata: {} }, fake(95));
    s.dispatch({ type: "addElement", element: text("u", { texture: { assetId: "otro" } }) });
    for (const id of ["a", "b", "c"]) {
      await s.addAsset({ id, kind: "image", mimeType: "image/png", metadata: {} }, fake(100));
      s.dispatch({ type: "addElement", element: text(`e${id}`, { texture: { assetId: id } }) });
    }
    expect(s.getState().nearLimit).toBe(false);
    expect(await s.paste()).toBe(true);
    expect(s.getState().nearLimit).toBe(true);
  });
});

describe("pegado de fuentes y recursos compartidos", () => {
  const font: Asset = { id: "f1", kind: "font", mimeType: "font/ttf", metadata: { family: "Zed" } };
  it("lleva la fuente subida al otro proyecto: queda en el documento y en el almacenamiento", async () => {
    const s = mk();
    await s.init();
    await s.addAsset(font, new Blob(["ttf"]));
    s.dispatch({ type: "addElement", element: text("t", { runs: [{ ...text("x").runs[0]!, fontFamily: "Zed" }] }) });
    s.select("t");
    s.copySelection();
    await s.newProject();
    const b = s.getState().history.present.id;
    expect(await s.paste()).toBe(true);
    expect(s.getState().history.present.assets.map((a) => a.id)).toEqual(["f1"]);
    expect(await storage.listAssetIds(b)).toContain("f1");
  });
  it("una textura usada también como máscara se escribe una sola vez", async () => {
    const s = mk();
    await s.init();
    await s.addAsset(tex, new Blob(["tex"]));
    await s.addDerivedBlob("tx.thumb", new Blob(["th"]));
    const mask = { assetId: "tx", mode: "alpha" as const, threshold: 0.5, softness: 0 };
    s.dispatch({ type: "addElement", element: text("t", { texture: { assetId: "tx" }, mask }) });
    s.select("t");
    s.copySelection();
    await s.newProject();
    const b = s.getState().history.present.id;
    const put = vi.spyOn(storage, "putAsset");
    expect(await s.paste()).toBe(true);
    expect(put.mock.calls.map((c) => c[1]).sort()).toEqual(["tx", "tx.thumb"]);
    expect(s.getState().history.present.assets.map((a) => a.id)).toEqual(["tx"]);
    expect(await storage.listAssetIds(b)).toEqual(expect.arrayContaining(["tx", "tx.thumb"]));
  });
});
