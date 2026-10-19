// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { FontRegistry } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`imgfx-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} fonts={new FontRegistry({ addFace: async () => undefined, loadCatalog: async () => true })} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  store.dispatch({ type: "addAsset", asset: { id: "a1", kind: "image", mimeType: "image/png", metadata: { widthPx: 600, heightPx: 900 } } });
  return store;
}
type Store = Awaited<ReturnType<typeof mount>>;
const el = (store: Store, id: string) => store.getState().history.present.elements.find((e) => e.id === id)!;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("opacidad y filtros de imagen", () => {
  it("una imagen seleccionada tiene desenfoque, brillo y saturación, y se pueden restablecer", async () => {
    const user = userEvent.setup();
    const store = await mount();
    store.dispatch({ type: "addElement", element: { id: "i1", type: "image", x: 0, y: 0, width: 2, height: 3, rotation: 0, zIndex: 0, visible: true, assetRef: { assetId: "a1" }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover" } });
    store.select("i1");
    fireEvent.change(await screen.findByLabelText("Desenfoque"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Brillo"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Saturación"), { target: { value: "120" } });
    expect(el(store, "i1")).toMatchObject({ filters: { blur: 30, brightness: 60, saturation: 120 } });
    await user.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect("filters" in el(store, "i1")).toBe(false);
  });
  it("cualquier capa tiene opacidad", async () => {
    const store = await mount();
    store.dispatch({ type: "addElement", element: { id: "s1", type: "shape", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true, shape: "rect", fill: "#000000" } });
    store.select("s1");
    fireEvent.change(await screen.findByLabelText("Opacidad"), { target: { value: "50" } });
    expect(el(store, "s1")).toMatchObject({ opacity: 0.5 });
  });
  it("el fondo con imagen tiene sus propios filtros", async () => {
    const store = await mount();
    store.dispatch({ type: "setBackground", background: { assetId: "a1" } });
    fireEvent.change(await screen.findByLabelText("Desenfoque del fondo"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Brillo del fondo"), { target: { value: "50" } });
    expect(store.getState().history.present.canvas.backgroundFilters).toEqual({ blur: 20, brightness: 50 });
  });
});
