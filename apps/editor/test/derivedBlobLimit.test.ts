import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { LIMITS } from "@free-book-cover/core";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const MB = 1024 * 1024;
const sized = (mb: number) => Object.defineProperty(new Blob(["x"]), "size", { value: mb * MB });
let n = 0;
async function mk() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`derived-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  return store;
}

describe("addDerivedBlob: el único límite es el total del proyecto", () => {
  it("acepta una miniatura mayor que el límite de fuentes con el proyecto vacío", async () => {
    const store = await mk();
    const mb = LIMITS.fontBytes / MB + 1;
    expect(await store.addDerivedBlob("img.thumb", sized(mb))).toBe(true);
    expect(store.getState().assets.some((a) => a.id === "img.thumb")).toBe(true);
  });

  it("la misma miniatura se rechaza si el total del proyecto no la admite", async () => {
    const store = await mk();
    for (let i = 0; i < 5; i++) await store.addAsset({ id: `img${i}`, kind: "image", mimeType: "image/png", metadata: {} }, sized(99), { widthPx: 1, heightPx: 1 });
    expect(await store.addDerivedBlob("img.thumb", sized(LIMITS.fontBytes / MB + 1))).toBe(false);
    expect(store.getState().assets.some((a) => a.id === "img.thumb")).toBe(false);
  });
});
