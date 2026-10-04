import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createEditorStore, ZOOM_MAX, ZOOM_MIN } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

async function mk() {
  const store = createEditorStore({ storage: await openStorage(`vs-${Math.random()}`), newId: () => "x", downloadParts: vi.fn() });
  await store.init();
  return store;
}

describe("estado de vista", () => {
  it("el zoom se acota y la selección/tono no tocan documento ni historial", async () => {
    const s = await mk();
    const rev = s.getState().history.present.revision;
    s.setZoom(100);
    expect(s.getState().zoom).toBe(ZOOM_MAX);
    s.setZoom(0.0001);
    expect(s.getState().zoom).toBe(ZOOM_MIN);
    s.setZoom(Number.NaN);
    expect(s.getState().zoom).toBe(ZOOM_MIN);
    s.select("a");
    s.setStageTone("linen");
    expect(s.getState()).toMatchObject({ selectedId: "a", stageTone: "linen" });
    expect(s.getState().history.present.revision).toBe(rev);
    expect(s.canUndo()).toBe(false);
  });
});

it("abrir otro proyecto vacía la variante activa y la caché del documento mostrado", async () => {
  const storage = await openStorage(`view-switch-${Date.now()}`);
  let i = 0;
  const s = createEditorStore({ storage, newId: () => `id${++i}`, downloadParts: () => {} });
  await s.init();
  const first = s.getState().history.present.id;
  expect(
    s.dispatch({
      type: "addDigitalTarget",
      target: { id: "v1", presetId: "instagram-feed-portrait", presetVersion: 1, widthPx: 1080, heightPx: 1350, layoutOverrides: {} },
    }),
  ).toBe(true);
  s.setActiveVariant("v1");
  const shown = s.displayDoc();
  await s.newProject("Otro");
  expect(s.getState().activeVariantId).toBeNull();
  expect(s.displayDoc()).not.toBe(shown);
  expect(s.displayDoc().id).not.toBe(first);
});
