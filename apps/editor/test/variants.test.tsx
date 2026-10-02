// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { overridesOf, type ShapeElement } from "@free-book-cover/core";
import { App } from "../src/App";
import type { ExportDeps } from "../src/export/exportImage";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

const okEnv = (): FontEnv => ({ addFace: async () => undefined, loadCatalog: async () => true });
let n = 0;
let dbName = "";
async function mount(opts: { exportServices?: { deps?: ExportDeps; download?: (b: Blob, f: string) => void }; fonts?: FontRegistry } = {}) {
  let i = 0;
  dbName = `var-${++n}`;
  const store = createEditorStore({ storage: await openStorage(dbName), newId: () => `id${++i}`, downloadParts: vi.fn() });
  const fonts = opts.fonts ?? new FontRegistry(okEnv());
  render(<I18nProvider><App store={store} fonts={fonts} {...(opts.exportServices ? { exportServices: opts.exportServices } : {})} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return { store, fonts };
}
const rect = (id: string, over: Partial<ShapeElement> = {}): ShapeElement => ({
  id, type: "shape", shape: "rect", x: 1, y: 2, width: 2, height: 1, rotation: 0, zIndex: 0, visible: true, fill: "#ff0000", ...over,
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function addVariant(user: ReturnType<typeof userEvent.setup>, presetId: string) {
  await user.selectOptions(screen.getByLabelText("Destino", { selector: "#variant-preset" }), presetId);
  await user.click(screen.getByRole("button", { name: "Añadir variante" }));
}

describe("panel de variantes", () => {
  it("crea dos variantes con proporciones distintas, alterna entre ellas y las elimina", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addVariant(user, "instagram-feed-portrait");
    await addVariant(user, "instagram-vertical");
    const targets = store.getState().history.present.digitalTargets!;
    expect(targets.map((t) => [t.presetId, t.widthPx, t.heightPx])).toEqual([["instagram-feed-portrait", 1080, 1350], ["instagram-vertical", 1080, 1920]]);
    // la última creada queda activa y se muestra su tamaño y proporción
    expect(store.getState().activeVariantId).toBe(targets[1]!.id);
    const list = screen.getByRole("list", { name: "Variantes" });
    expect(within(list).getByText(/1080×1350 · 4:5 · v1/)).toBeInTheDocument();
    expect(within(list).getByText(/1080×1920 · 9:16 · v1/)).toBeInTheDocument();
    expect(screen.getByTestId("variant-area")).toHaveTextContent("Área visible: 84 % del diseño base");
    await user.click(within(list).getByRole("button", { name: /^Instagram · Feed vertical 4:5/ }));
    expect(store.getState().activeVariantId).toBe(targets[0]!.id);
    expect(screen.getByTestId("variant-area")).toHaveTextContent("Área visible: 83 % del diseño base");
    await user.click(within(list).getByRole("button", { name: "Diseño base" }));
    expect(store.getState().activeVariantId).toBeNull();
    await user.click(within(list).getByRole("button", { name: "Eliminar variante Instagram · Feed vertical 4:5" }));
    expect(store.getState().history.present.digitalTargets!.map((t) => t.id)).toEqual([targets[1]!.id]);
  });

  it("tamaño personalizado: valida y guarda las dimensiones resueltas", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await user.selectOptions(screen.getByLabelText("Destino", { selector: "#variant-preset" }), "custom");
    fireEvent.change(screen.getByLabelText(/ANCHO.*px/, { selector: "#variant-w" }), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Añadir variante" }));
    expect(screen.getByRole("alert")).toHaveTextContent("tamaño entero válido");
    expect(store.getState().history.present.digitalTargets).toBeUndefined();
    fireEvent.change(screen.getByLabelText(/ANCHO.*px/, { selector: "#variant-w" }), { target: { value: "800" } });
    fireEvent.change(screen.getByLabelText(/ALTO.*px/, { selector: "#variant-h" }), { target: { value: "600" } });
    await user.click(screen.getByRole("button", { name: "Añadir variante" }));
    expect(store.getState().history.present.digitalTargets![0]).toMatchObject({ presetId: "custom", widthPx: 800, heightPx: 600 });
  });

  it("editar la geometría con una variante activa solo cambia esa variante; el base y la otra no se tocan", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    store.dispatch({ type: "addElement", element: rect("s1") });
    await addVariant(user, "instagram-feed-portrait");
    await addVariant(user, "instagram-vertical");
    const [a, b] = store.getState().history.present.digitalTargets!;
    const baseBefore = JSON.stringify(store.getState().history.present.elements);
    store.setActiveVariant(a!.id!);
    store.select("s1");
    const x = (await screen.findByLabelText("X (in)")) as HTMLInputElement;
    // el panel muestra el valor derivado de la variante: (1-3)*0,6+1,8 = 0,6
    expect(x).toHaveValue(0.6);
    fireEvent.change(x, { target: { value: "0.25" } });
    fireEvent.blur(x);
    const doc = store.getState().history.present;
    expect(overridesOf(doc.digitalTargets![0]!).elements!.s1).toEqual({ x: 0.25 });
    expect(overridesOf(doc.digitalTargets![1]!).elements).toBeUndefined();
    expect(JSON.stringify(doc.elements)).toBe(baseBefore);
    expect(store.displayDoc().elements[0]!.x).toBe(0.25);
    // al volver al base, el elemento sigue donde estaba
    store.setActiveVariant(null);
    expect(store.displayDoc().elements[0]!.x).toBe(1);
    store.setActiveVariant(b!.id!);
    expect(store.displayDoc().elements[0]!.x).not.toBe(0.25);
  });

  it("avisa de elementos fuera del área visible y permite ocultarlos o restablecer solo en la variante", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    store.dispatch({ type: "addElement", element: rect("s1", { x: 0, y: 0, width: 0.5, height: 0.5 }) });
    await addVariant(user, "instagram-feed-portrait");
    const id = store.getState().history.present.digitalTargets![0]!.id!;
    // 4:5 muestra desde y = 0,75 in del base: el cuadro de la esquina superior queda fuera
    expect(screen.getAllByTestId("variant-outside")[0]).toHaveTextContent("queda fuera de esta variante");
    store.select("s1");
    await user.click(await screen.findByLabelText("Visible en esta variante"));
    expect(overridesOf(store.getState().history.present.digitalTargets![0]!).elements!.s1).toEqual({ visible: false });
    expect(store.getState().history.present.elements[0]!.visible).toBe(true);
    await user.click(screen.getByRole("button", { name: "Restablecer variante" }));
    expect(store.getState().history.present.digitalTargets!.find((t) => t.id === id)!.layoutOverrides).toEqual({});
    // deshacer / rehacer pasan por el historial común
    store.undo();
    expect(overridesOf(store.getState().history.present.digitalTargets![0]!).elements!.s1).toEqual({ visible: false });
    store.redo();
    expect(store.getState().history.present.digitalTargets![0]!.layoutOverrides).toEqual({});
  });

  it("guardar y reabrir conserva variantes y ajustes", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    store.dispatch({ type: "addElement", element: rect("s1") });
    await addVariant(user, "instagram-feed-portrait");
    const id = store.getState().history.present.digitalTargets![0]!.id!;
    store.dispatch({ type: "setVariantElement", targetId: id, elementId: "s1", props: { x: 0.3 } });
    await store.save();
    const saved = store.getState().history.present;
    cleanup();
    let i = 100;
    const again = createEditorStore({ storage: await openStorage(dbName), newId: () => `z${++i}`, downloadParts: vi.fn() });
    await again.init();
    expect(again.getState().history.present.digitalTargets).toEqual(saved.digitalTargets);
  });
});

describe("modal de exportación", () => {
  const okDeps = (over: Partial<ExportDeps> = {}): ExportDeps => ({
    fonts: { ensureDoc: () => {}, whenSettled: async () => {}, checkFontsReady: () => ({ ok: true }) },
    missingAssets: () => [],
    render: vi.fn(async () => ({})),
    encode: vi.fn(async (_c, mime) => new Blob([new Uint8Array(2048)], { type: mime as string })),
    ...over,
  });

  it("exporta una variante con sus píxeles exactos, descarga el archivo y muestra el informe", async () => {
    const user = userEvent.setup();
    const deps = okDeps();
    const download = vi.fn();
    const { store } = await mount({ exportServices: { deps, download } });
    await addVariant(user, "instagram-feed-portrait");
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    const dialog = screen.getByRole("dialog", { name: "Exportar portada" });
    expect(within(dialog).getByTestId("export-size")).toHaveTextContent("1080×1350 px");
    // la variante activa es el destino por defecto; Instagram no ofrece WebP
    expect(within(dialog).getByLabelText("Destino")).toHaveDisplayValue(/4:5/);
    expect(within(dialog).getByRole("radio", { name: /WebP/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: /JPEG/ }));
    fireEvent.change(within(dialog).getByLabelText("Calidad"), { target: { value: "70" } });
    await user.click(within(dialog).getByRole("button", { name: "Descargar JPEG" }));
    const report = await within(dialog).findByTestId("export-report");
    expect(report).toHaveTextContent("JPEG · 70%");
    expect(report).toHaveTextContent("1080×1350 px");
    expect(report).toHaveTextContent("2.0 KB");
    expect(report).toHaveTextContent("Instagram · Feed vertical 4:5");
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![1]).toMatch(/-instagram-feed-vertical-4-5-1080x1350\.jpg$/);
    const renderCall = (deps.render as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(renderCall[1]).toEqual({ widthPx: 1080, heightPx: 1350 });
    expect(renderCall[0].canvas.widthIn * 300).toBeCloseTo(1080, 6);
    // exportar no modifica el documento
    expect(store.isDirty()).toBe(true);
    expect(store.getState().history.present.revision).toBe(1);
  });

  it("el diseño base se exporta a 300 ppp; por encima de 50 MP se bloquea y ofrece reducir", async () => {
    const user = userEvent.setup();
    const deps = okDeps();
    const { store } = await mount({ exportServices: { deps, download: vi.fn() } });
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    expect(screen.getByTestId("export-size")).toHaveTextContent("1800×2700 px");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    store.dispatch({ type: "setCanvas", widthIn: 30, heightIn: 30 });
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    expect(screen.getByTestId("export-size")).toHaveTextContent("9000×9000 px");
    expect(screen.getByTestId("export-limit")).toHaveTextContent("81.0 megapíxeles");
    expect(screen.getByRole("button", { name: "Descargar PNG" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Reducir a 7071×7071 px/ }));
    expect(screen.getByTestId("export-size")).toHaveTextContent("7071×7071 px");
    expect(screen.queryByTestId("export-limit")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Descargar PNG" }));
    await screen.findByTestId("export-report");
    expect(deps.render).toHaveBeenCalledWith(expect.anything(), { widthPx: 7071, heightPx: 7071 });
  });

  it("fuentes sin cargar bloquean la exportación y se pueden reintentar desde el informe", async () => {
    const user = userEvent.setup();
    let fail = true;
    const env: FontEnv = { addFace: async () => undefined, loadCatalog: async () => { if (fail) throw new Error("sin red"); return true; } };
    const fonts = new FontRegistry(env);
    const deps = okDeps({ fonts: fonts as unknown as ExportDeps["fonts"] });
    const download = vi.fn();
    const { store } = await mount({ fonts, exportServices: { deps, download } });
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    const family = (store.getState().history.present.elements[0] as { runs: Array<{ fontFamily: string }> }).runs[0]!.fontFamily;
    await waitFor(() => expect(fonts.stateOf(family)).toBe("failed"));
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Descargar PNG" }));
    const err = await within(dialog).findByTestId("export-error");
    expect(err).toHaveTextContent("No se exporta");
    expect(within(err).getByTestId("export-font-problem")).toHaveTextContent(`«${family}»`);
    expect(deps.render).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    fail = false;
    await user.click(within(err).getByRole("button", { name: "Reintentar carga de fuentes" }));
    await waitFor(() => expect(within(dialog).queryByTestId("export-error")).not.toBeInTheDocument());
    await user.click(within(dialog).getByRole("button", { name: "Descargar PNG" }));
    await within(dialog).findByTestId("export-report");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("si el reintento de fuentes vuelve a fallar, el aviso se mantiene", async () => {
    const user = userEvent.setup();
    const env: FontEnv = { addFace: async () => undefined, loadCatalog: async () => { throw new Error("sin red"); } };
    const fonts = new FontRegistry(env);
    const { store } = await mount({ fonts, exportServices: { deps: okDeps({ fonts: fonts as unknown as ExportDeps["fonts"] }), download: vi.fn() } });
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    const family = (store.getState().history.present.elements[0] as { runs: Array<{ fontFamily: string }> }).runs[0]!.fontFamily;
    await waitFor(() => expect(fonts.stateOf(family)).toBe("failed"));
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Descargar PNG" }));
    await within(dialog).findByTestId("export-error");
    await user.click(within(dialog).getByRole("button", { name: "Reintentar carga de fuentes" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Reintentar carga de fuentes" })).toBeEnabled());
    expect(within(dialog).getByTestId("export-font-problem")).toHaveTextContent(`«${family}»`);
  });

  it("Escape y el fondo cierran el modal; la interfaz sigue en catalán al cambiar de idioma", async () => {
    const user = userEvent.setup();
    await mount({ exportServices: { deps: okDeps(), download: vi.fn() } });
    await user.click(screen.getByRole("radio", { name: "CA" }));
    await user.click(screen.getByRole("button", { name: "Exporta" }));
    const dialog = screen.getByRole("dialog", { name: "Exportar coberta" });
    expect(within(dialog).getByText("Destinació")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Descarrega PNG" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Exporta" }));
    await user.click(screen.getByTestId("export-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("estado de vista de variantes", () => {
  it("la variante activa se limpia si desaparece (deshacer) y no se puede activar una inexistente", async () => {
    const { store } = await mount();
    const target = { id: "v1", presetId: "custom", presetVersion: 1, widthPx: 100, heightPx: 100, layoutOverrides: {} };
    store.dispatch({ type: "addDigitalTarget", target });
    store.setActiveVariant("nope");
    expect(store.getState().activeVariantId).toBeNull();
    store.setActiveVariant("v1");
    expect(store.getState().activeVariantId).toBe("v1");
    expect(store.displayDoc().canvas.widthIn).toBeCloseTo(100 / 300, 9);
    expect(store.displayDoc()).toBe(store.displayDoc());
    store.undo();
    expect(store.getState().activeVariantId).toBeNull();
    expect(store.displayDoc()).toBe(store.getState().history.present);
    // cambiar de variante no incrementa la revisión ni ensucia el documento
    expect(store.getState().history.present.revision).toBeGreaterThan(0);
  });
});
