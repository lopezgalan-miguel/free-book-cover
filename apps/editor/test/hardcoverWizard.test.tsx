// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const okEnv = (): FontEnv => ({ addFace: async () => undefined, loadCatalog: async () => true });
let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`hardcover-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} fonts={new FontRegistry(okEnv())} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
type Store = Awaited<ReturnType<typeof mount>>;
const withBackground = (store: Store, widthPx: number, heightPx: number) => act(() => {
  store.dispatch({ type: "addAsset", asset: { id: "bg", kind: "image", mimeType: "image/png", metadata: { widthPx, heightPx } } });
  store.dispatch({ type: "setBackground", background: { assetId: "bg" } });
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const wizard = () => within(screen.getByRole("form", { name: "Cubierta KDP" }));

describe("asistente KDP: tapa dura", () => {
  it("con un fondo que no llega a 300 ppp, «Tapa dura» se deshabilita y se avisa de qué imagen falla", async () => {
    const store = await mount();
    await withBackground(store, 1600, 2560);
    const w = wizard();
    expect(w.getByRole("button", { name: "Tapa dura" })).toBeDisabled();
    const alert = screen.getByTestId("hardcover-dpi");
    expect(alert).toHaveTextContent("no llega al mínimo de 300 ppp");
    expect(alert).toHaveTextContent("Imagen de fondo");
    expect(alert).toHaveTextContent(/1\d\d ppp/);
  });

  it("con un fondo suficiente se aplica la tapa dura: cortes de tapa dura, solapa y bisagra, y lienzo de la plantilla", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await withBackground(store, 4000, 3100);
    const w = wizard();
    await user.click(w.getByRole("button", { name: "Tapa dura" }));
    expect(w.getByRole("button", { name: "Tapa dura" })).toHaveAttribute("aria-pressed", "true");
    const trims = within(w.getByLabelText("Tamaño de corte")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(trims).toEqual(["5.5x8.5", "6x9", "6.14x9.21", "7x10", "8.25x11"]);
    expect(within(w.getByLabelText("Papel y tinta")).queryByRole("option", { name: /estándar/ })).toBeNull();
    await user.selectOptions(w.getByLabelText("Tamaño de corte"), "5.5x8.5");
    await user.clear(w.getByLabelText("Número de páginas"));
    await user.type(w.getByLabelText("Número de páginas"), "116");
    await user.selectOptions(w.getByLabelText("Papel y tinta"), "bw-cream");
    const summary = screen.getByTestId("kdp-summary");
    expect(summary).toHaveTextContent("Solapa");
    expect(summary).toHaveTextContent("Bisagra");
    expect(summary).toHaveTextContent("13.0538 × 9.9173 in");
    await user.click(w.getByRole("button", { name: "Aplicar configuración" }));
    const doc = store.getState().history.present;
    expect(doc.printSetup).toMatchObject({ binding: "hardcover", trimWidthIn: 5.5, pageCount: 116 });
    expect(doc.canvas.widthIn).toBeCloseTo(939.8721 / 72, 5);
    expect(doc.canvas.heightIn).toBeCloseTo(714.0472 / 72, 5);

    // Volver a tapa blanda quita la encuadernación.
    await user.click(w.getByRole("button", { name: "Tapa blanda" }));
    await user.click(w.getByRole("button", { name: "Aplicar configuración" }));
    const back = store.getState().history.present.printSetup!;
    expect("binding" in back).toBe(false);
  });

  it("en tapa dura, un corte que no llega a 300 ppp deshabilita «Aplicar» con el aviso", async () => {
    const user = userEvent.setup();
    const store = await mount();
    // Suficiente para 5,5 × 8,5 (≈ 306 ppp) pero no para 8,25 × 11.
    await withBackground(store, 4000, 3100);
    const w = wizard();
    await user.click(w.getByRole("button", { name: "Tapa dura" }));
    await user.selectOptions(w.getByLabelText("Tamaño de corte"), "8.25x11");
    expect(w.getByRole("button", { name: "Aplicar configuración" })).toBeDisabled();
    expect(screen.getByTestId("hardcover-dpi")).toHaveTextContent("Imagen de fondo");
  });
});
