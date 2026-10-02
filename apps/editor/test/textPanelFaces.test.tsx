// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TextElement } from "@free-book-cover/core";
import { App } from "../src/App";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
const asked: string[] = [];
const env = (): FontEnv => ({ addFace: async () => undefined, loadCatalog: async (f, w, i) => (asked.push(`${f}|${w}|${i}`), true) });
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`faces-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  const fonts = new FontRegistry(env());
  render(<I18nProvider><App store={store} fonts={fonts} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return { store, fonts };
}
type M = Awaited<ReturnType<typeof mount>>;
const textOf = (s: M["store"]) => s.getState().history.present.elements[0] as TextElement;
const setRun = (s: M["store"], over: Partial<TextElement["runs"][number]>) =>
  s.dispatch({ type: "updateElement", id: textOf(s).id, props: { runs: textOf(s).runs.map((r) => ({ ...r, ...over })) } });
async function addText(user: ReturnType<typeof userEvent.setup>, s: M["store"]) {
  await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
  await screen.findByLabelText("Contenido del texto");
  expect(textOf(s).type).toBe("text");
}
const weightOptions = () => within(screen.getByLabelText("Peso")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);

beforeEach(() => { localStorage.clear(); asked.length = 0; });
afterEach(cleanup);

describe("gestos continuos en el panel de texto (I-3)", () => {
  it("escribir varias teclas seguidas es un único paso de deshacer", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    const before = store.getState().history.past.length;
    const ta = screen.getByLabelText("Contenido del texto") as HTMLTextAreaElement;
    for (const v of ["H", "Ho", "Hol", "Hola"]) fireEvent.change(ta, { target: { value: v } });
    expect(store.getState().history.past.length).toBe(before + 1);
    expect(textOf(store).runs.map((r) => r.text).join("")).toBe("Hola");
    store.undo();
    expect(textOf(store).runs.map((r) => r.text).join("")).not.toBe("Hola");
    expect(textOf(store).runs.map((r) => r.text).join("")).not.toBe("Hol");
  });
  it("al salir del campo el siguiente cambio abre un paso nuevo", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    const ta = screen.getByLabelText("Contenido del texto") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "uno" } });
    fireEvent.blur(ta);
    fireEvent.change(ta, { target: { value: "unodos" } });
    store.undo();
    expect(textOf(store).runs.map((r) => r.text).join("")).toBe("uno");
  });
  it("arrastrar el selector de color (muchos eventos input) es un solo paso", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    const before = store.getState().history.past.length;
    const picker = screen.getByLabelText("Selector de color");
    for (const c of ["#111111", "#222222", "#333333", "#444444"]) fireEvent.change(picker, { target: { value: c } });
    expect(store.getState().history.past.length).toBe(before + 1);
    expect(textOf(store).runs[0]!.color).toBe("#444444");
    store.undo();
    expect(textOf(store).runs[0]!.color).toBe("#f4efe6");
  });
  it("un cambio de otro tipo entre dos de color no se fusiona con ellos", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    const before = store.getState().history.past.length;
    fireEvent.change(screen.getByLabelText("Selector de color"), { target: { value: "#111111" } });
    await user.click(screen.getByRole("button", { name: "Subrayado" }));
    fireEvent.change(screen.getByLabelText("Selector de color"), { target: { value: "#222222" } });
    expect(store.getState().history.past.length).toBe(before + 3);
  });
});

describe("caras disponibles en el panel de texto (I-4)", () => {
  it("el selector de peso solo ofrece los pesos de la familia", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    expect(textOf(store).runs[0]!.fontFamily).toBe("Lora");
    expect(weightOptions()).toEqual(["400", "500", "600", "700"]);
    await user.click(within(screen.getByRole("group", { name: "Lista de fuentes" })).getByRole("button", { name: /Oswald/ }));
    expect(weightOptions()).toEqual(["300", "400", "500", "600", "700"]);
    await user.click(within(screen.getByRole("group", { name: "Lista de fuentes" })).getByRole("button", { name: /Marcellus/ }));
    expect(weightOptions()).toEqual(["400"]);
  });
  it("cursiva y negrita se desactivan cuando la familia no tiene esa cara", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    await user.click(within(screen.getByRole("group", { name: "Lista de fuentes" })).getByRole("button", { name: /Oswald/ }));
    expect(screen.getByRole("button", { name: "Cursiva" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Negrita" })).toBeEnabled();
    await user.click(within(screen.getByRole("group", { name: "Lista de fuentes" })).getByRole("button", { name: /Marcellus/ }));
    expect(screen.getByRole("button", { name: "Negrita" })).toBeDisabled();
  });
  it("al cambiar de familia se pasa a la cara más próxima a la vista, no en silencio al exportar", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    setRun(store, { weight: 700, italic: true });
    await user.click(within(screen.getByRole("group", { name: "Lista de fuentes" })).getByRole("button", { name: /Oswald/ }));
    expect(textOf(store).runs[0]).toMatchObject({ fontFamily: "Oswald", weight: 700, italic: false });
    expect(asked).toContain("Oswald|700|false");
    expect(asked.some((a) => a.endsWith("|true") && a.startsWith("Oswald"))).toBe(false);
  });
  it("activar cursiva en una familia con una sola cursiva ajusta el peso a esa cara", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addText(user, store);
    setRun(store, { weight: 700 });
    await user.click(screen.getByRole("button", { name: "Cursiva" }));
    expect(textOf(store).runs[0]).toMatchObject({ fontFamily: "Lora", weight: 400, italic: true });
  });
  it("un diseño con una cara inexistente avisa y la exportación se bloquea", async () => {
    const user = userEvent.setup();
    const { store, fonts } = await mount();
    await addText(user, store);
    await user.click(within(screen.getByRole("group", { name: "Lista de fuentes" })).getByRole("button", { name: /Oswald/ }));
    // Un cliente externo (MCP) o un documento antiguo pueden pedir una cursiva que Oswald no tiene.
    setRun(store, { italic: true });
    const notice = await screen.findByTestId("font-warning");
    expect(notice).toHaveTextContent(/Oswald/);
    expect(notice).toHaveTextContent(/peso o la cursiva/);
    expect(fonts.checkFontsReady(store.getState().history.present)).toMatchObject({ ok: false, problems: [{ family: "Oswald", reason: "face_missing" }] });
    // La cara inexistente no se pidió al navegador (devolvería otra más próxima y se daría por cargada).
    expect(asked).not.toContain("Oswald|400|true");
    // El selector muestra el peso actual marcado como no disponible en vez de ocultarlo.
    expect(screen.getByRole("button", { name: "Cursiva" })).toBeEnabled();
  });
});
