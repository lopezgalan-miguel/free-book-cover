import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedTexture } from "@free-book-cover/core";
import { generateTextureAsset, generatorOptionsOf } from "../src/images/generateTexture";
import type { Asset } from "@free-book-cover/core";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
// Codificador falso: un PNG con solo la cabecera y las medidas de la textura (Node no tiene canvas).
const fakeEncode = vi.fn(async (t: GeneratedTexture) =>
  new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(t.widthPx), ...be32(t.heightPx), 8, 6, 0, 0, 0])], { type: "image/png" }));

describe("generateTextureAsset", () => {
  it("genera la textura, la codifica en PNG y la guarda como recurso del proyecto", async () => {
    let i = 0;
    const store = createEditorStore({ storage: await openStorage("gen-tex"), newId: () => `id${++i}`, downloadParts: vi.fn() });
    await store.init();
    const r = await generateTextureAsset(store, { kind: "stone", seed: 9, sizePx: 128 }, { encode: fakeEncode, makeThumbnail: async () => null });
    expect(r).toEqual({ ok: true, assetId: expect.any(String) });
    expect(fakeEncode).toHaveBeenCalledWith(expect.objectContaining({ widthPx: 128, heightPx: 128 }));
    const asset = store.getState().history.present.assets.find((a) => r.ok && a.id === r.assetId);
    expect(asset).toMatchObject({ kind: "image", mimeType: "image/png", metadata: { widthPx: 128, heightPx: 128, name: "textura-stone-9.png" } });
  });

  it("guarda las opciones del generador en el recurso", async () => {
    let i = 0;
    const store = createEditorStore({ storage: await openStorage("gen-tex-meta"), newId: () => `id${++i}`, downloadParts: vi.fn() });
    await store.init();
    const opts = { kind: "cracked-marble", seed: 7, scale: 7, color: "#e4dfd9", soften: 4, cracks: "holes" } as const;
    const r = await generateTextureAsset(store, opts, { encode: fakeEncode, makeThumbnail: async () => null });
    const asset = store.getState().history.present.assets.find((a) => r.ok && a.id === r.assetId);
    expect(asset?.metadata.generator).toEqual(opts);
  });

  it("generatorOptionsOf valida", () => {
    const asset = (generator?: unknown): Asset => ({ id: "a", kind: "image", mimeType: "image/png", metadata: { widthPx: 1, heightPx: 1, ...(generator === undefined ? {} : { generator }) } });
    expect(generatorOptionsOf(undefined)).toBeNull();
    expect(generatorOptionsOf(asset())).toBeNull();
    expect(generatorOptionsOf(asset({ kind: "lava", seed: 1 }))).toBeNull();
    expect(generatorOptionsOf(asset({ kind: "stone", seed: "7" }))).toBeNull();
    expect(generatorOptionsOf(asset({ kind: "stone", seed: 7, scale: 5, color: "rojo", soften: 2 }))).toEqual({ kind: "stone", seed: 7, scale: 5, soften: 2 });
  });
});
