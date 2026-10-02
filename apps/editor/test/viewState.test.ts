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
