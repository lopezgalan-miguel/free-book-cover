// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ShapeElement, TextElement } from "@free-book-cover/core";
import { App } from "../src/App";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const okEnv = (): FontEnv => ({ addFace: async () => undefined, loadCatalog: async () => true });
let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`kdp-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} fonts={new FontRegistry(okEnv())} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
const text = (id: string, over: Partial<TextElement> = {}): TextElement => ({
  id, type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "Título", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#000000" }],
  align: "center", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0, ...over,
});
const rect = (id: string, over: Partial<ShapeElement> = {}): ShapeElement => ({
  id, type: "shape", shape: "rect", x: 1, y: 2, width: 2, height: 1, rotation: 0, zIndex: 0, visible: true, fill: "#ff0000", ...over,
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const dispatch = (store: Awaited<ReturnType<typeof mount>>, cmd: Parameters<Awaited<ReturnType<typeof mount>>["dispatch"]>[0]) => act(() => void store.dispatch(cmd));
const wizard = () => within(screen.getByRole("form", { name: "Cubierta KDP" }));

describe("asistente de cubierta KDP", () => {
  it("muestra lomo y tamaño total en vivo y aplica la configuración como un solo comando", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const w = wizard();
    await user.selectOptions(w.getByLabelText("Tamaño de corte"), "6x9");
    await user.clear(w.getByLabelText("Número de páginas"));
    await user.type(w.getByLabelText("Número de páginas"), "300");
    await user.selectOptions(w.getByLabelText("Papel y tinta"), "bw-cream");
    const summary = screen.getByTestId("kdp-summary");
    expect(summary).toHaveTextContent("0.75 in");
    expect(summary).toHaveTextContent("13 × 9.25 in");
    expect(summary).toHaveTextContent("El lomo admite texto");
    await user.click(w.getByRole("button", { name: "Aplicar configuración" }));
    const doc = store.getState().history.present;
    expect(doc.mode).toBe("kdp-paperback");
    expect(doc.printSetup).toMatchObject({ trimWidthIn: 6, trimHeightIn: 9, pageCount: 300, paperAndInk: "bw-cream" });
    expect(doc.canvas.widthIn).toBeCloseTo(13);
    expect(doc.revision).toBe(1);
    // deshacer restaura el documento previo
    store.undo();
    expect(store.getState().history.present.printSetup).toBeUndefined();
  });
  it("rechaza páginas fuera de rango y tamaños no contrastados, y no aplica", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const w = wizard();
    await user.clear(w.getByLabelText("Número de páginas"));
    await user.type(w.getByLabelText("Número de páginas"), "10");
    expect(w.getByRole("alert")).toHaveTextContent("Mínimo 24 páginas");
    expect(w.getByRole("button", { name: "Aplicar configuración" })).toBeDisabled();
    await user.clear(w.getByLabelText("Número de páginas"));
    await user.type(w.getByLabelText("Número de páginas"), "900");
    expect(w.getByRole("alert")).toHaveTextContent("Máximo 828");
    await user.selectOptions(w.getByLabelText("Tamaño de corte"), "custom");
    await user.clear(w.getByLabelText("Ancho de corte (in)"));
    await user.type(w.getByLabelText("Ancho de corte (in)"), "3");
    expect(w.getByRole("alert")).toHaveTextContent("entre 4–8,5 in");
    await user.clear(w.getByLabelText("Ancho de corte (in)"));
    await user.type(w.getByLabelText("Ancho de corte (in)"), "8");
    await user.clear(w.getByLabelText("Número de páginas"));
    await user.type(w.getByLabelText("Número de páginas"), "100");
    expect(w.getByRole("alert")).toHaveTextContent("solo se admiten los tamaños 5 × 8 y 6 × 9");
    expect(store.getState().history.present.printSetup).toBeUndefined();
  });
  it("avisa de los elementos que quedan fuera al recalcular y los lista en la revisión", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(wizard().getByRole("button", { name: "Aplicar configuración" }));
    dispatch(store, { type: "addElement", element: rect("big", { x: 12, y: 0.2, width: 0.9, height: 8.8 }) });
    await user.selectOptions(wizard().getByLabelText("Tamaño de corte"), "5x8");
    await user.click(wizard().getByRole("button", { name: "Aplicar configuración" }));
    expect(wizard().getByRole("status")).toHaveTextContent("1 elemento(s) quedan fuera del lienzo");
    expect(within(screen.getByTestId("kdp-review")).getAllByTestId("kdp-issue")).toHaveLength(1);
  });
  it("catalán", async () => {
    const user = userEvent.setup();
    localStorage.setItem("kdp.lang", "ca");
    await mount();
    expect(screen.getByRole("form", { name: "Coberta KDP" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nombre de pàgines"));
    await user.type(screen.getByLabelText("Nombre de pàgines"), "10");
    expect(screen.getByRole("alert")).toHaveTextContent("Mínim 24 pàgines");
  });
});

describe("revisión y guías", () => {
  async function configured(pages = "100") {
    const user = userEvent.setup();
    const store = await mount();
    await user.clear(wizard().getByLabelText("Número de páginas"));
    await user.type(wizard().getByLabelText("Número de páginas"), pages);
    await user.click(wizard().getByRole("button", { name: "Aplicar configuración" }));
    return { user, store };
  }
  it("sin avisos con texto en zona segura; identifica texto fuera de zona segura y de lomo con pocas páginas", async () => {
    const { store } = await configured("50");
    dispatch(store, { type: "addElement", element: text("ok", { x: 1, y: 1 }) });
    expect(screen.getByText("Sin avisos.")).toBeInTheDocument();
    dispatch(store, { type: "addElement", element: text("out", { x: 0.2, y: 1 }) });
    dispatch(store, { type: "addElement", element: text("spine", { x: 6.15, y: 1, width: 0.1, height: 4 }) });
    const issues = screen.getAllByTestId("kdp-issue").map((i) => i.textContent);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("texto fuera de la zona segura");
    expect(issues[1]).toContain("al menos 79 páginas");
    expect(screen.getByText(/no sustituye la validación de KDP/)).toBeInTheDocument();
  });
  it("seleccionar un aviso selecciona el elemento", async () => {
    const { user, store } = await configured();
    dispatch(store, { type: "addElement", element: text("out", { x: 0.2, y: 1 }) });
    await user.click(within(screen.getByTestId("kdp-issue")).getByRole("button"));
    expect(store.getState().selectedId).toBe("out");
  });
  it("fondo que no cubre el sangrado", async () => {
    const { store } = await configured();
    dispatch(store, { type: "addAsset", asset: { id: "a", kind: "image", mimeType: "image/png", metadata: { widthPx: 100, heightPx: 100 } } });
    dispatch(store, { type: "setBackground", background: { assetId: "a" } });
    dispatch(store, { type: "setBackgroundLayout", fit: "contain" });
    expect(screen.getByTestId("kdp-issue")).toHaveTextContent("El fondo no cubre el sangrado");
  });
  it("el interruptor de guías es estado de vista, fuera del documento", async () => {
    const { user, store } = await configured();
    const rev = store.getState().history.present.revision;
    const sw = screen.getByRole("switch", { name: "Guías" });
    expect(sw).toBeChecked();
    await user.click(sw);
    expect(store.getState().guidesVisible).toBe(false);
    expect(store.getState().history.present.revision).toBe(rev);
  });
});
