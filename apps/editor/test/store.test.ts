import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@free-book-cover/core";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

let n = 0;
let dbName: string;
let storage: ProjectStorage;
const downloadParts = vi.fn();
const mk = (st: ProjectStorage = storage): EditorStore => {
  let i = 0;
  return createEditorStore({ storage: st, newId: () => `id${++i}`, downloadParts, maxBackupPartBytes: 1000 });
};
const text = (id: string) => ({
  id, type: "text" as const, x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
  align: "center" as const, lineHeight: 1.2, letterSpacing: 0.02,
  shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
});

beforeEach(async () => {
  dbName = `store-db-${++n}`;
  storage = await openStorage(dbName);
  downloadParts.mockClear();
});

describe("editorStore", () => {
  it("arranca con proyecto nuevo si no hay nada guardado", async () => {
    const s = mk();
    await s.init();
    expect(s.getState()).toMatchObject({ ready: true, error: null });
    expect(s.getState().history.present.id).toBe("id1");
  });
  it("edita con comandos, deshace/rehace y marca sucio", async () => {
    const s = mk();
    await s.init();
    expect(s.dispatch({ type: "addElement", element: text("t1") })).toBe(true);
    expect(s.isDirty()).toBe(true);
    s.undo();
    expect(s.getState().history.present.elements).toHaveLength(0);
    expect(s.canRedo()).toBe(true);
    s.redo();
    expect(s.getState().history.present.elements).toHaveLength(1);
  });
  it("comando inválido deja el documento intacto y registra el error", async () => {
    const s = mk();
    await s.init();
    const rev = s.getState().history.present.revision;
    expect(s.dispatch({ type: "removeElement", id: "nada" })).toBe(false);
    expect(s.getState().error).toMatchObject({ kind: "command", error: { kind: "not_found" } });
    expect(s.getState().history.present.revision).toBe(rev);
    s.dismissError();
    expect(s.getState().error).toBeNull();
  });
  it("guardar y recuperar en otra sesión (round trip)", async () => {
    const s = mk();
    await s.init();
    s.dispatch({ type: "addElement", element: text("t1") });
    expect(await s.save()).toBe(true);
    expect(s.isDirty()).toBe(false);
    expect(s.getState().status).toBe("saved");

    const s2 = mk(await openStorage(dbName));
    await s2.init();
    expect(s2.getState().history.present).toEqual(s.getState().history.present);
    expect(s2.isDirty()).toBe(false);
  });
  it("versión no compatible: abre proyecto nuevo, avisa y no sobrescribe", async () => {
    const raw = indexedDB.open(dbName);
    await new Promise<void>((r) => (raw.onsuccess = () => r()));
    await new Promise<void>((r) => {
      const tx = raw.result.transaction(["projects", "meta"], "readwrite");
      tx.objectStore("projects").put({ id: "old", updatedAt: 1, doc: { ...createProject({ id: "old" }), schemaVersion: 7 } });
      tx.objectStore("meta").put("old", "lastProjectId");
      tx.oncomplete = () => r();
    });
    raw.result.close();
    const s = mk();
    await s.init();
    expect(s.getState().error).toEqual({ kind: "unsupported_version" });
    expect(s.getState().history.present.id).toBe("id1");
    await s.save();
    const old = await storage.loadProject("old");
    expect(old).toMatchObject({ ok: false, error: { kind: "unsupported_version", found: 7 } });
  });
  it("fallo de lectura inesperado se informa sin romper", async () => {
    const broken = { ...storage, loadLastProject: () => Promise.reject(new Error("x")) };
    const s = mk(broken);
    await s.init();
    expect(s.getState()).toMatchObject({ ready: true, error: { kind: "load" } });
  });
  it("cuota: el estado en memoria sigue y se ofrece copia por partes", async () => {
    const quota = { ...storage, saveProject: async () => ({ ok: false as const, kind: "quota" as const, message: "" }) };
    const s = mk(quota);
    await s.init();
    s.dispatch({ type: "addElement", element: text("t1") });
    expect(await s.save()).toBe(false);
    expect(s.getState().error).toEqual({ kind: "quota" });
    expect(s.getState().history.present.elements).toHaveLength(1);
    expect(s.isDirty()).toBe(true);
    const count = await s.downloadBackup();
    expect(count).toBe(1);
    expect(downloadParts).toHaveBeenCalledTimes(1);
    expect(s.getState().backupParts).toBe(1);
  });
  it("otro fallo de guardado (incluida excepción) da error genérico", async () => {
    const s = mk({ ...storage, saveProject: () => Promise.reject(new Error("x")) });
    await s.init();
    expect(await s.save()).toBe(false);
    expect(s.getState().error).toEqual({ kind: "save" });
  });
  it("addAsset guarda el blob y registra el recurso; cuota al guardar blob", async () => {
    const s = mk();
    await s.init();
    const asset = { id: "a1", kind: "image" as const, mimeType: "image/png", metadata: {} };
    expect(await s.addAsset(asset, new Blob([new Uint8Array(3000)]))).toBe(true);
    expect(s.getState().history.present.assets).toHaveLength(1);
    expect(await s.downloadBackup()).toBeGreaterThan(1);

    const q = mk({ ...storage, putAsset: async () => ({ ok: false as const, kind: "quota" as const, message: "" }) });
    await q.init();
    expect(await q.addAsset(asset, new Blob(["x"]))).toBe(false);
    expect(q.getState().error).toEqual({ kind: "quota" });
    expect(q.getState().history.present.assets).toHaveLength(0);
  });
  it("notifica a los suscriptores", async () => {
    const s = mk();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    await s.init();
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    s.dispatch({ type: "setCanvas", widthIn: 5, heightIn: 5 });
    expect(fn).not.toHaveBeenCalled();
  });
});
