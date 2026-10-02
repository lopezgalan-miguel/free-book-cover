import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@free-book-cover/core";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

let n = 0;
let dbName: string;
let storage: ProjectStorage;
const mk = (st: ProjectStorage = storage): EditorStore => {
  let i = 0;
  return createEditorStore({ storage: st, newId: () => `id${++i}`, downloadParts: vi.fn(), now: () => 0 });
};
const img = (id: string): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: {} });
const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "image/png" });
const image = (id: string, assetId: string) => ({
  id, type: "image" as const, x: 0, y: 0, width: 2, height: 2, rotation: 0, zIndex: 0, visible: true,
  assetRef: { assetId }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover" as const,
});
const rows = async (s: ProjectStorage, projectId: string) => (await s.listAssetIds(projectId)).sort();

beforeEach(async () => {
  dbName = `assets-db-${++n}`;
  storage = await openStorage(dbName);
});

describe("liberación de espacio (I-1)", () => {
  it("deshacer una importación no pierde el blob mientras se pueda rehacer; al guardar se purga solo lo inalcanzable", async () => {
    const s = mk();
    await s.init();
    await s.addAsset(img("a1"), blob(10));
    s.undo();
    expect(s.getState().history.present.assets).toHaveLength(0);
    await s.save();
    // Rehacer sigue disponible: el blob se conserva.
    expect(s.getState().assets.map((a) => a.id)).toEqual(["a1"]);
    s.redo();
    expect(s.getState().history.present.assets).toHaveLength(1);
    // Una edición nueva vacía rehacer: el blob queda sin referencia desde ningún paso... salvo el pasado.
    s.undo();
    s.dispatch({ type: "setName", name: "x" });
    await s.save();
    expect(s.getState().assets).toHaveLength(0);
    expect(await rows(storage, s.getState().history.present.id)).toEqual([]);
  });
  it("al cargar se borran los blobs que no están en el documento guardado (y sus miniaturas)", async () => {
    const s = mk();
    await s.init();
    const id = s.getState().history.present.id;
    await s.addAsset(img("keep"), blob(5));
    await s.save();
    // Importación sin guardar en una sesión anterior: blob + miniatura huérfanos.
    await storage.putAsset(id, "lost", blob(7));
    await storage.putAsset(id, "lost.thumb", blob(3));
    await storage.putAsset(id, "keep.thumb", blob(2));
    const s2 = mk(await openStorage(dbName));
    await s2.init();
    expect(s2.getState().assets.map((a) => a.id).sort()).toEqual(["keep", "keep.thumb"]);
    expect(await rows(storage, id)).toEqual(["keep", "keep.thumb"]);
  });
  it("no toca blobs que se están guardando", async () => {
    const s = mk();
    await s.init();
    let release!: () => void;
    const slow: ProjectStorage = { ...storage, putAsset: async (p, a, b) => { await new Promise<void>((r) => (release = r)); return storage.putAsset(p, a, b); } };
    const t = mk(slow);
    await t.init();
    const adding = t.addAsset(img("a1"), blob(4));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect((await t.purgeOrphans()).removed).toBe(0);
    release();
    expect(await adding).toBe(true);
    expect(t.getState().assets.map((a) => a.id)).toEqual(["a1"]);
  });
  it("«liberar espacio» quita los recursos sin uso, borra sus blobs y baja el contador", async () => {
    const s = mk();
    await s.init();
    await s.addAsset(img("bg1"), blob(1000));
    s.dispatch({ type: "setBackground", background: { assetId: "bg1" } });
    await s.addAsset(img("bg2"), blob(2000));
    await s.addDerivedBlob("bg1.thumb", blob(50));
    s.dispatch({ type: "setBackground", background: { assetId: "bg2" } });
    const before = s.projectBytes();
    expect(s.unusedAssets()).toEqual({ ids: ["bg1"], bytes: 1050 });
    const r = await s.freeUnused();
    expect(r.removed).toBe(1);
    expect(s.getState().history.present.assets.map((a) => a.id)).toEqual(["bg2"]);
    expect(s.getState().assets.map((a) => a.id)).toEqual(["bg2"]);
    expect(await rows(storage, s.getState().history.present.id)).toEqual(["bg2"]);
    expect(before - s.projectBytes()).toBeGreaterThanOrEqual(1050);
    expect(r.bytes).toBe(before - s.projectBytes());
    // El historial se descarta (los pasos anteriores usaban el recurso borrado).
    expect(s.canUndo()).toBe(false);
    expect(s.isDirty()).toBe(true);
  });
  it("sin recursos sin uso no cambia nada y conserva el historial", async () => {
    const s = mk();
    await s.init();
    await s.addAsset(img("a"), blob(10));
    s.dispatch({ type: "addElement", element: image("i", "a") });
    expect(await s.freeUnused()).toEqual({ removed: 0, bytes: 0 });
    expect(s.canUndo()).toBe(true);
  });
  it("el aviso de 400 MB desaparece al liberar espacio", async () => {
    const stub: ProjectStorage = { ...storage, putAsset: async () => ({ ok: true }), deleteAsset: async () => undefined };
    const s = mk(stub);
    await s.init();
    const fake = (size: number) => ({ size, type: "image/png" }) as unknown as Blob;
    for (let k = 0; k < 5; k++) {
      expect(await s.addAsset(img(`a${k}`), fake(90 * 1024 * 1024))).toBe(true);
      s.dispatch({ type: "addElement", element: image(`i${k}`, `a${k}`) });
    }
    expect(s.getState().nearLimit).toBe(true);
    for (let k = 0; k < 5; k++) s.dispatch({ type: "removeElement", id: `i${k}` });
    const r = await s.freeUnused();
    expect(r.removed).toBe(5);
    expect(s.getState().nearLimit).toBe(false);
    expect(s.getState().assets).toHaveLength(0);
    // El espacio liberado vuelve a permitir importar sin chocar con el máximo de 500 MB.
    expect(await s.addAsset(img("again"), fake(90 * 1024 * 1024))).toBe(true);
  });
  it("antes de rechazar por tamaño se purgan los huérfanos y se reintenta", async () => {
    const s = mk();
    await s.init();
    const mb = 1024 * 1024;
    await s.addAsset(img("a"), new Blob([new Uint8Array(1)]));
    // Estado con un huérfano enorme (solo en memoria, p. ej. importación fallida a medias).
    const huge = { id: "ghost", blob: { size: 499 * mb } as unknown as Blob };
    (s.getState() as { assets: unknown[] }).assets.push(huge);
    expect(s.projectBytes()).toBeGreaterThan(499 * mb);
    expect(await s.addAsset(img("b"), new Blob([new Uint8Array(2 * mb)]))).toBe(true);
    expect(s.getState().assets.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });
});
