import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedTexture } from "@free-book-cover/core";
import { generateTextureAsset } from "../src/images/generateTexture";
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
});
