import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createProject, type Project } from "@free-book-cover/core";
import { createBackupParts, restoreBackup } from "../src/storage/backup";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const doc = (): Project => ({ ...createProject({ id: "p", name: "N" }), assets: [
  { id: "a1", kind: "image", mimeType: "image/png", metadata: {} },
  { id: "f1", kind: "font", mimeType: "font/ttf", metadata: { family: "X" } },
] });
const blob = (n: number, type = "image/png") => new Blob([new Uint8Array(n).fill(5)], { type });
describe("copia con miniaturas", () => {
  it("ida y vuelta con imagen y miniatura, también dividida en partes", async () => {
    for (const max of [1_000_000, 1500]) {
      const parts = await createBackupParts(doc(), [{ id: "a1", blob: blob(3000) }, { id: "a1.thumb", blob: blob(700, "image/webp") }, { id: "f1", blob: blob(10, "font/ttf") }], max);
      const r = await restoreBackup(parts.map((p) => p.blob));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.assets.map((a) => [a.id, a.blob.size]).sort()).toEqual([["a1", 3000], ["a1.thumb", 700], ["f1", 10]]);
      expect(r.assets.find((a) => a.id === "a1.thumb")!.blob.type).toBe("image/webp");
    }
  });
  it("rechaza miniaturas sin base, de una fuente o ids raros", async () => {
    for (const id of ["zz.thumb", "f1.thumb", ".thumb", "a1.thumb.thumb", "a1.thumbs", "a1/.thumb"]) {
      const parts = await createBackupParts(doc(), [{ id: "a1", blob: blob(10) }, { id, blob: blob(5) }], 1_000_000);
      expect((await restoreBackup(parts.map((p) => p.blob))).ok, id).toBe(false);
    }
  });
  it("rechaza una miniatura duplicada", async () => {
    const parts = await createBackupParts(doc(), [{ id: "a1", blob: blob(10) }, { id: "a1.thumb", blob: blob(5) }], 1_000_000);
    const m = JSON.parse(await parts[0]!.blob.text()) as { assets: Array<{ id: string; size: number }> };
    m.assets.push({ id: "a1.thumb", size: 5 });
    const bad = [new Blob([JSON.stringify(m)]), ...parts.slice(1).map((p) => p.blob)];
    expect((await restoreBackup(bad)).ok).toBe(false);
  });
  it("downloadBackup del almacén con miniatura se restaura con importBackup", async () => {
    const saved: Blob[] = [];
    const mk = async (name: string) => createEditorStore({ storage: await openStorage(name), newId: () => "p1", downloadParts: (ps) => void saved.push(...ps.map((p) => p.blob)) });
    const a = await mk("thumbs-a");
    await a.init();
    await a.addAsset({ id: "i1", kind: "image", mimeType: "image/png", metadata: {} }, blob(500));
    await a.addDerivedBlob("i1.thumb", blob(50, "image/webp"));
    await a.downloadBackup();
    const b = await mk("thumbs-b");
    await b.init();
    expect(await b.importBackup(saved)).toBe(true);
    expect(b.getState().assets.map((x) => x.id).sort()).toEqual(["i1", "i1.thumb"]);
  });
});
