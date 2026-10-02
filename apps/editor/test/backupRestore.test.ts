import { describe, expect, it } from "vitest";
import { createProject, type Project } from "@free-book-cover/core";
import { createBackupParts, restoreBackup } from "../src/storage/backup";

const doc = (): Project => ({ ...createProject({ id: "p", name: "N" }), assets: [{ id: "a1", kind: "image", mimeType: "image/png", metadata: {} }] });
const blobOf = (o: unknown) => new Blob([JSON.stringify(o)]);
const good = async (): Promise<Record<string, unknown>> => {
  const parts = await createBackupParts(doc(), [{ id: "a1", blob: new Blob([new Uint8Array(30).fill(1)]) }], 100000);
  // Se reagrupa en una sola parte para poder alterar campos sueltos.
  return { ...(JSON.parse(await parts[0]!.blob.text()) as Record<string, unknown>), parts: 1, assets: [{ id: "a1", size: 3 }], chunks: [{ assetId: "a1", index: 0, count: 1, data: "AQEB" }] };
};

describe("validación de la forma de la copia de seguridad", () => {
  it("rechaza tipos incorrectos en cualquier campo en vez de lanzar", async () => {
    const m = await good();
    // Control: sin alterar, la copia es válida (los rechazos de abajo son por el campo cambiado).
    expect((await restoreBackup([blobOf(m)])).ok).toBe(true);
    const cases: Array<Record<string, unknown>> = [
      { ...m, part: "1" },
      { ...m, parts: 0 },
      { ...m, projectId: 7 },
      { ...m, chunks: "x" },
      { ...m, chunks: [{ assetId: "a1", index: 5, count: 2, data: "AA==" }] },
      { ...m, chunks: [{ assetId: 1, index: 0, count: 1, data: "AA==" }] },
      { ...m, assets: [{ id: "a1", size: "3" }] },
      { ...m, assets: "x" },
      { ...m, assets: undefined },
      { ...m, version: "1" },
    ];
    for (const c of cases) expect((await restoreBackup([blobOf(c)])).ok, JSON.stringify(c).slice(0, 80)).toBe(false);
    expect((await restoreBackup([blobOf([1, 2])])).ok).toBe(false);
    expect((await restoreBackup([blobOf(null)])).ok).toBe(false);
  });
  it("rechaza datos base64 corruptos, trozos incoherentes y tamaños distintos del declarado", async () => {
    const m = await good();
    const chunk = { assetId: "a1", index: 0, count: 1, data: "AQEB" };
    expect((await restoreBackup([blobOf({ ...m, chunks: [{ ...chunk, data: "%%%no-base64%%%" }] })])).ok).toBe(false);
    expect((await restoreBackup([blobOf({ ...m, chunks: [chunk, { ...chunk, count: 2, index: 1 }] })])).ok).toBe(false);
    const r = await restoreBackup([blobOf({ ...m, assets: [{ id: "a1", size: 9 }], chunks: [chunk] })]);
    expect(r).toMatchObject({ ok: false, error: { kind: "backup" } });
  });
  it("rechaza recursos que el documento no declara", async () => {
    const m = await good();
    const r = await restoreBackup([blobOf({ ...m, assets: [{ id: "otro", size: 1 }], chunks: [{ assetId: "otro", index: 0, count: 1, data: "AQ==" }] })]);
    expect(r).toMatchObject({ ok: false, error: { kind: "backup" } });
  });
  it("aplica los límites del producto a los recursos restaurados", async () => {
    const m = await good();
    // Fuente de más de 20 MB declarada como tal.
    const d = { ...doc(), assets: [{ id: "a1", kind: "font" as const, mimeType: "font/ttf", metadata: { family: "X" } }] };
    const big = "A".repeat(Math.ceil((21 * 1024 * 1024) / 3) * 4);
    const r = await restoreBackup([blobOf({ ...m, doc: d, assets: [{ id: "a1", size: Math.floor((big.length / 4) * 3) }], chunks: [{ assetId: "a1", index: 0, count: 1, data: big }] })]);
    expect(r).toMatchObject({ ok: false, error: { kind: "limit", error: { kind: "font_too_large" } } });
  });
  it("una copia válida sigue restaurándose", async () => {
    const m = await good();
    const parts = await createBackupParts(doc(), [{ id: "a1", blob: new Blob([new Uint8Array(30).fill(1)]) }], 100000);
    expect(m.format).toBe("kdp-cover-backup");
    expect(await restoreBackup(parts.map((p) => p.blob))).toMatchObject({ ok: true });
  });
});
