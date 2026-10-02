// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createProject, type Command, type Project } from "@free-book-cover/core";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";
import { createBackupParts, restoreBackup } from "../src/storage/backup";

let n = 0;
let storage: ProjectStorage;
beforeEach(async () => {
  storage = await openStorage(`test-db-${++n}`);
});

function docWithImage(): Project {
  let p = createProject({ id: "p1", name: "Mi libro" });
  const cmds: Command[] = [
    { type: "addAsset", asset: { id: "a1", kind: "image", mimeType: "image/png", metadata: { w: 2 } } },
    { type: "addAsset", asset: { id: "f1", kind: "font", mimeType: "font/ttf", metadata: {} } },
    { type: "setCanvas", widthIn: 8.5, heightIn: 11 },
    { type: "addElement", element: { id: "i1", type: "image", x: 0, y: 0, width: 8.5, height: 11, rotation: 0, zIndex: 0, visible: true, assetRef: { assetId: "a1" }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover" } },
    { type: "addElement", element: { id: "t1", type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 15, zIndex: 0, visible: true, runs: [{ text: "Título", fontFamily: "Lora", fontSizePt: 40, weight: 700, italic: true, underline: false, uppercase: true, color: "#ffffff" }], align: "center", lineHeight: 1.1, letterSpacing: 0.05, shadow: { on: true, intensity: 60 }, outline: { on: true, width: 2, color: "#000000" }, curvature: -30 } },
  ];
  for (const c of cmds) {
    const r = applyCommand(p, c, p.revision);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    p = r.doc;
  }
  return p;
}

describe("IndexedDB (fake)", () => {
  it("ida y vuelta: guardar, recargar y recuperar documento y blobs", async () => {
    const doc = docWithImage();
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: "image/png" });
    const font = new Blob([new Uint8Array([0, 1, 0, 0, 9])], { type: "font/ttf" });
    expect(await storage.putAsset("p1", "a1", png)).toEqual({ ok: true });
    expect(await storage.putAsset("p1", "f1", font)).toEqual({ ok: true });
    expect(await storage.saveProject(doc)).toEqual({ ok: true });
    storage.close();

    // "recarga": nueva conexión a la misma base
    const again = await openStorage(`test-db-${n}`);
    const r = await again.loadLastProject();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project).toEqual(doc);
    const byId = Object.fromEntries(r.assets.map((a) => [a.id, a.blob]));
    expect(new Uint8Array(await byId.a1!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
    expect(byId.f1!.size).toBe(5);
    expect(await again.listProjects()).toMatchObject([{ id: "p1", name: "Mi libro", revision: doc.revision }]);
  });
  it("sin proyectos devuelve not_found", async () => {
    expect(await storage.loadLastProject()).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(await storage.loadProject("x")).toEqual({ ok: false, error: { kind: "not_found" } });
  });
  it("guardar de nuevo sustituye y borrar limpia documento y recursos", async () => {
    const doc = docWithImage();
    await storage.putAsset("p1", "a1", new Blob(["x"]));
    await storage.saveProject(doc);
    const r2 = applyCommand(doc, { type: "setCanvas", widthIn: 5, heightIn: 5 }, doc.revision);
    if (!r2.ok) throw new Error("x");
    await storage.saveProject(r2.doc);
    const l = await storage.loadProject("p1");
    expect(l.ok && l.project.revision).toBe(r2.doc.revision);
    await storage.deleteProject("p1");
    expect(await storage.loadLastProject()).toEqual({ ok: false, error: { kind: "not_found" } });
    expect((await storage.loadProject("p1")).ok).toBe(false);
  });
  it("versión posterior: se rechaza al cargar y no se sobrescribe al guardar", async () => {
    const raw = indexedDB.open(`test-db-${n}`);
    await new Promise<void>((res) => { raw.onsuccess = () => res(); });
    const db = raw.result;
    const future = { ...createProject({ id: "p1" }), schemaVersion: 99 };
    await new Promise<void>((res) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({ id: "p1", updatedAt: 1, doc: future });
      tx.oncomplete = () => res();
    });
    db.close();
    const l = await storage.loadProject("p1");
    expect(l).toMatchObject({ ok: false, error: { kind: "unsupported_version", found: 99 } });
    const s = await storage.saveProject(createProject({ id: "p1", name: "nuevo" }));
    expect(s).toMatchObject({ ok: false, kind: "incompatible" });
    const still = await storage.loadProject("p1");
    expect(still).toMatchObject({ ok: false, error: { kind: "unsupported_version" } });
  });
  it("documento corrupto en disco se informa como inválido", async () => {
    const raw = indexedDB.open(`test-db-${n}`);
    await new Promise<void>((res) => { raw.onsuccess = () => res(); });
    await new Promise<void>((res) => {
      const tx = raw.result.transaction("projects", "readwrite");
      tx.objectStore("projects").put({ id: "p1", updatedAt: 1, doc: { schemaVersion: 1, id: "p1" } });
      tx.oncomplete = () => res();
    });
    raw.result.close();
    expect(await storage.loadProject("p1")).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });
});

describe("error de cuota", () => {
  it("se traduce a kind quota sin lanzar", async () => {
    const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const { openDB } = await import("idb");
    const { createStorage } = await import("../src/storage/projectStorage");
    storage.close();
    const db = await openDB(`test-db-${n}`);
    const failing = createStorage(db as never);
    vi.spyOn(db, "transaction").mockImplementation(() => { throw quota; });
    vi.spyOn(db, "put").mockRejectedValue(quota);
    expect(await failing.saveProject(createProject({ id: "q" }))).toMatchObject({ ok: false, kind: "quota" });
    expect(await failing.putAsset("q", "a", new Blob(["x"]))).toMatchObject({ ok: false, kind: "quota" });
    vi.restoreAllMocks();
    vi.spyOn(db, "put").mockRejectedValue(new Error("otro"));
    expect(await failing.putAsset("q", "a", new Blob(["x"]))).toMatchObject({ ok: false, kind: "error" });
  });
});

describe("copia de seguridad", () => {
  it("ida y vuelta con varias partes y recursos mayores que una parte", async () => {
    const doc = docWithImage();
    const bytes = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
    const assets = [
      { id: "a1", blob: new Blob([bytes], { type: "image/png" }) },
      { id: "f1", blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "font/ttf" }) },
    ];
    const parts = await createBackupParts(doc, assets, 2000);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts[0]!.filename).toMatch(/^mi-libro-copia-1-de-\d+\.json$/);
    for (const p of parts.slice(1)) expect(p.blob.size).toBeLessThanOrEqual(2000 + 200);
    const r = await restoreBackup([...parts].reverse().map((p) => p.blob));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project).toEqual(doc);
    const a1 = r.assets.find((a) => a.id === "a1")!;
    expect(new Uint8Array(await a1.blob.arrayBuffer())).toEqual(bytes);
    expect(a1.blob.type).toBe("image/png");
  });
  it("una sola parte cuando todo cabe y proyecto sin recursos", async () => {
    const doc = createProject({ id: "z", name: "" });
    const parts = await createBackupParts(doc, []);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.filename).toBe("z-copia-1-de-1.json");
    const r = await restoreBackup(parts.map((p) => p.blob));
    expect(r).toMatchObject({ ok: true, assets: [] });
  });
  it("detecta partes que faltan y contenido ajeno", async () => {
    const doc = docWithImage();
    const parts = await createBackupParts(doc, [{ id: "a1", blob: new Blob([new Uint8Array(3000)]) }, { id: "f1", blob: new Blob(["ab"]) }], 1000);
    expect((await restoreBackup(parts.slice(0, -1).map((p) => p.blob))).ok).toBe(false);
    expect((await restoreBackup([new Blob(["no json"])])).ok).toBe(false);
    expect((await restoreBackup([new Blob(['{"format":"otro"}'])])).ok).toBe(false);
    expect((await restoreBackup([])).ok).toBe(false);
  });
});
