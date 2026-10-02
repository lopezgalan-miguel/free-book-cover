import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, type Asset, type TextElement } from "@free-book-cover/core";
import { createEditorStore, type EditorStore } from "../src/store/editorStore";
import { createBackupParts } from "../src/storage/backup";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

let n = 0;
let dbName: string;
let storage: ProjectStorage;
let clock = 0;
const mk = (st: ProjectStorage = storage, prefix = "id"): EditorStore => {
  let i = 0;
  return createEditorStore({ storage: st, newId: () => `${prefix}${++i}`, downloadParts: vi.fn(), now: () => clock });
};
const text = (id: string): TextElement => ({
  id, type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
  align: "center", lineHeight: 1.2, letterSpacing: 0.02,
  shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
});
const img = (id: string): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: {} });

beforeEach(async () => {
  dbName = `proj-db-${++n}`;
  storage = await openStorage(dbName);
  clock = 0;
});

describe("gestos continuos en el almacén (I-3)", () => {
  const type = (s: EditorStore, value: string) =>
    s.dispatch({ type: "updateElement", id: "t", props: { runs: [{ ...text("t").runs[0]!, text: value }] } }, { mergeKey: "t:text" });
  it("cada pulsación de un mismo gesto es un solo paso de deshacer", async () => {
    const s = mk();
    await s.init();
    s.dispatch({ type: "addElement", element: text("t") });
    for (const v of ["H", "Ho", "Hol", "Hola!"]) { clock += 100; type(s, v); }
    s.undo();
    expect(s.getState().history.present.elements[0]).toMatchObject({ runs: [{ text: "Hola" }] });
    expect(s.canUndo()).toBe(true);
    s.redo();
    expect(s.getState().history.present.elements[0]).toMatchObject({ runs: [{ text: "Hola!" }] });
  });
  it("una pausa o endGesture abren un paso nuevo", async () => {
    const s = mk();
    await s.init();
    s.dispatch({ type: "addElement", element: text("t") });
    type(s, "a");
    clock += 5000;
    type(s, "ab");
    s.endGesture();
    clock += 10;
    type(s, "abc");
    s.undo();
    expect(s.getState().history.present.elements[0]).toMatchObject({ runs: [{ text: "ab" }] });
    s.undo();
    expect(s.getState().history.present.elements[0]).toMatchObject({ runs: [{ text: "a" }] });
  });
  it("muchas pulsaciones no agotan el límite de 100 pasos anteriores", async () => {
    const s = mk();
    await s.init();
    for (let i = 0; i < 20; i++) s.dispatch({ type: "setCanvas", widthIn: 5 + i, heightIn: 5 });
    s.dispatch({ type: "addElement", element: text("t") });
    for (let i = 0; i < 300; i++) { clock += 10; type(s, `x${i}`); }
    expect(s.getState().history.past.length).toBe(22);
  });
  it("un comando inválido con clave de fusión no cambia nada", async () => {
    const s = mk();
    await s.init();
    const rev = s.getState().history.present.revision;
    expect(s.dispatch({ type: "updateElement", id: "nada", props: { x: 1 } }, { mergeKey: "k" })).toBe(false);
    expect(s.getState().history.present.revision).toBe(rev);
  });
});

describe("proyecto: nombre, nuevo y abrir (I-5)", () => {
  it("setName se deshace y rehace", async () => {
    const s = mk();
    await s.init();
    expect(s.setName("  Mi novela ")).toBe(true);
    expect(s.getState().history.present.name).toBe("Mi novela");
    s.undo();
    expect(s.getState().history.present.name).toBe("");
    s.redo();
    expect(s.getState().history.present.name).toBe("Mi novela");
    expect(s.setName("x".repeat(500))).toBe(false);
  });
  it("crear proyecto nuevo guarda antes el abierto y abre uno vacío; abrir otro lo recupera", async () => {
    const s = mk();
    await s.init();
    s.setName("Primero");
    s.dispatch({ type: "addElement", element: text("t") });
    const first = s.getState().history.present.id;
    expect(await s.newProject("Segundo")).toBe(true);
    const cur = s.getState().history.present;
    expect(cur.id).not.toBe(first);
    expect(cur).toMatchObject({ name: "Segundo", elements: [] });
    await s.save();
    const list = await s.listProjects();
    expect(list.map((p) => p.name).sort()).toEqual(["Primero", "Segundo"]);
    expect(await s.openProject(first)).toBe(true);
    expect(s.getState().history.present).toMatchObject({ id: first, name: "Primero" });
    expect(s.getState().history.present.elements).toHaveLength(1);
    expect(s.canUndo()).toBe(false);
    expect(s.isDirty()).toBe(false);
    // Es el último proyecto abierto: se recupera tras recargar.
    const re = mk(await openStorage(dbName));
    await re.init();
    expect(re.getState().history.present.id).toBe(first);
  });
  it("si no se puede guardar lo pendiente no se cambia de proyecto", async () => {
    const s = mk({ ...storage, saveProject: async () => ({ ok: false as const, kind: "quota" as const, message: "" }) });
    await s.init();
    s.setName("A");
    expect(await s.newProject()).toBe(false);
    expect(s.getState().history.present.name).toBe("A");
  });
  it("el estado de vista no se arrastra al cambiar de proyecto", async () => {
    const s = mk();
    await s.init();
    s.dispatch({ type: "addElement", element: text("t") });
    s.select("t");
    await s.newProject();
    expect(s.getState().selectedId).toBeNull();
  });
  it("un proyecto nuevo sin tocar no se guarda ni sustituye al último abierto", async () => {
    const s = mk();
    await s.init();
    s.setName("Real");
    await s.save();
    const id = s.getState().history.present.id;
    await s.newProject();
    const re = mk(await openStorage(dbName));
    await re.init();
    expect(re.getState().history.present.id).toBe(id);
  });
  it("borrar otro proyecto lo elimina con sus recursos; el abierto no se puede borrar", async () => {
    const s = mk();
    await s.init();
    await s.addAsset(img("a1"), new Blob(["x"]));
    await s.save();
    const first = s.getState().history.present.id;
    await s.newProject("Otro");
    expect(await s.deleteProject(s.getState().history.present.id)).toBe(false);
    expect(await s.deleteProject(first)).toBe(true);
    expect((await s.listProjects()).map((p) => p.id)).not.toContain(first);
    expect(await storage.listAssetIds(first)).toEqual([]);
  });
});

describe("restaurar copia de seguridad (I-5)", () => {
  const backupOf = async () => {
    const src = mk(await openStorage(`src-${n}`), "src");
    await src.init();
    await src.addAsset(img("a1"), new Blob([new Uint8Array(3000).fill(7)], { type: "image/png" }));
    src.setName("Copia");
    return createBackupParts(src.getState().history.present, src.getState().assets, 1500);
  };
  it("importa todas las partes, guarda y abre el proyecto con sus recursos", async () => {
    const parts = await backupOf();
    expect(parts.length).toBeGreaterThan(2);
    const s = mk();
    await s.init();
    expect(await s.importBackup(parts.map((p) => p.blob))).toBe(true);
    expect(s.getState().history.present).toMatchObject({ id: "src1", name: "Copia" });
    expect(s.getState().assets.map((a) => a.id)).toEqual(["a1"]);
    expect(s.hasUnsavedChanges()).toBe(false);
    const re = mk(await openStorage(dbName));
    await re.init();
    expect(re.getState().history.present.name).toBe("Copia");
    expect(re.getState().assets[0]!.blob.size).toBe(3000);
  });
  it("un archivo no válido o incompleto se rechaza sin tocar el proyecto abierto", async () => {
    const parts = await backupOf();
    const s = mk();
    await s.init();
    s.setName("Abierto");
    expect(await s.importBackup(parts.slice(1).map((p) => p.blob))).toBe(false);
    expect(s.getState().error).toEqual({ kind: "restore" });
    expect(await s.importBackup([new Blob(["{}"])])).toBe(false);
    expect(s.getState().history.present.name).toBe("Abierto");
  });
  it("restaurar sobre el mismo proyecto retira los recursos que la copia ya no tiene", async () => {
    const parts = await backupOf();
    const s = mk();
    await s.init();
    await s.importBackup(parts.map((p) => p.blob));
    await s.addAsset(img("extra"), new Blob(["zz"]));
    await s.save();
    // Se restaura la copia antigua: «extra» desaparece también del disco.
    expect(await s.importBackup(parts.map((p) => p.blob))).toBe(true);
    expect(await storage.listAssetIds("src1")).toEqual(["a1"]);
  });
  it("fallo de guardado al restaurar: error y sin blobs sueltos", async () => {
    const parts = await backupOf();
    const s = mk({ ...storage, saveProject: async () => ({ ok: false as const, kind: "quota" as const, message: "" }) });
    await s.init();
    expect(await s.importBackup(parts.map((p) => p.blob))).toBe(false);
    expect(s.getState().error).toEqual({ kind: "quota" });
    expect(await storage.listAssetIds("src1")).toEqual([]);
    expect(createProject({ id: "x" }).id).toBe("x");
  });
});
