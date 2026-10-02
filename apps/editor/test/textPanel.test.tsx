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

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0])], "tex.png", { type: "image/png" });
const ttf = (name: string) => new File([new Uint8Array([0, 1, 0, 0, 1, 2, 3, 4])], name);

const okEnv = (): FontEnv => ({ addFace: async () => undefined, loadCatalog: async () => true });
let n = 0;
let dbName = "";
async function mount(opts: { env?: FontEnv | null; reuse?: boolean } = {}) {
  let i = 0;
  if (!opts.reuse) dbName = `txt-${++n}`;
  const store = createEditorStore({ storage: await openStorage(dbName), newId: () => `id${++i}`, downloadParts: vi.fn() });
  const fonts = new FontRegistry(opts.env === undefined ? okEnv() : opts.env);
  render(<I18nProvider><App store={store} fonts={fonts} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return { store, fonts };
}
const textOf = (store: Awaited<ReturnType<typeof mount>>["store"]) => store.getState().history.present.elements[0] as TextElement;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function addAndWrite(user: ReturnType<typeof userEvent.setup>, store: Awaited<ReturnType<typeof mount>>["store"], content: string) {
  await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
  const ta = (await screen.findByLabelText("Contenido del texto")) as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: content } });
  expect(textOf(store).runs.map((r) => r.text).join("")).toBe(content);
  return ta;
}
const fontList = () => screen.getByRole("group", { name: "Lista de fuentes" });
const select = (ta: HTMLTextAreaElement, a: number, b: number) => {
  ta.setSelectionRange(a, b);
  fireEvent.select(ta);
};

describe("panel de texto: fragmentos", () => {
  it("el estilo se aplica solo a la selección; sin selección, a todo el bloque", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    const ta = await addAndWrite(user, store, "Hola mundo");
    expect(screen.getByTestId("style-scope")).toHaveTextContent("todo el bloque");
    select(ta, 5, 10);
    expect(screen.getByTestId("style-scope")).toHaveTextContent("la selección (5)");
    await user.click(screen.getByRole("button", { name: "Negrita" }));
    expect(textOf(store).runs.map((r) => [r.text, r.weight])).toEqual([["Hola ", 500], ["mundo", 700]]);
    expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute("aria-pressed", "true");
    select(ta, 0, 4);
    expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute("aria-pressed", "false");
    select(ta, 0, 10);
    expect(screen.getByLabelText("Peso")).toHaveDisplayValue("Mixto");
    select(ta, 3, 3);
    await user.click(screen.getByRole("button", { name: "Subrayado" }));
    expect(textOf(store).runs.every((r) => r.underline)).toBe(true);
    // un solo paso de historial por cambio
    store.undo();
    expect(textOf(store).runs.some((r) => r.underline)).toBe(false);
  });

  it("escribir dentro de un fragmento conserva los estilos; guardar y reabrir los recupera", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    const ta = await addAndWrite(user, store, "Hola mundo");
    select(ta, 5, 10);
    await user.click(screen.getByRole("button", { name: "Cursiva" }));
    select(ta, 5, 5);
    fireEvent.change(ta, { target: { value: "Hola XXmundo" } });
    // lo insertado hereda el estilo del carácter anterior (el espacio, sin cursiva)
    expect(textOf(store).runs.map((r) => [r.text, r.italic])).toEqual([["Hola XX", false], ["mundo", true]]);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByText("Guardado")).toBeInTheDocument());
    const saved = textOf(store).runs;
    cleanup();
    const again = await mount({ reuse: true });
    await waitFor(() => expect(again.store.getState().history.present.elements).toHaveLength(1));
    expect(textOf(again.store).runs).toEqual(saved);
    expect(saved).toHaveLength(2);
    expect(saved[0]!.italic).not.toBe(saved[1]!.italic);
  });
});

describe("panel de texto: controles", () => {
  it("alineación, color (hex, selector y muestras), sombra, contorno y curvatura pasan por comandos", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addAndWrite(user, store, "Titulo");
    await user.click(screen.getByRole("button", { name: "Alinear a la derecha" }));
    expect(textOf(store).align).toBe("right");
    await user.click(screen.getByRole("button", { name: "Justificar" }));
    expect(textOf(store).align).toBe("justify");

    await user.click(screen.getByRole("button", { name: "Muestra #B4453A" }));
    expect(textOf(store).runs[0]!.color).toBe("#b4453a");
    const hex = screen.getByLabelText("Color hexadecimal");
    fireEvent.change(hex, { target: { value: "12ab9F" } });
    expect(textOf(store).runs[0]!.color).toBe("#12ab9f");
    fireEvent.change(hex, { target: { value: "12ab" } }); // incompleto: no cambia
    expect(textOf(store).runs[0]!.color).toBe("#12ab9f");
    fireEvent.change(screen.getByLabelText("Selector de color"), { target: { value: "#00ff00" } });
    expect(textOf(store).runs[0]!.color).toBe("#00ff00");

    expect(screen.queryByLabelText("Intensidad de la sombra")).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Sombra" }));
    expect(textOf(store).shadow.on).toBe(true);
    fireEvent.change(screen.getByLabelText("Intensidad de la sombra"), { target: { value: "80" } });
    expect(textOf(store).shadow).toEqual({ on: true, intensity: 80 });

    await user.click(screen.getByRole("switch", { name: "Contorno" }));
    fireEvent.change(screen.getByLabelText("Grosor del contorno"), { target: { value: "6.5" } });
    fireEvent.change(screen.getByLabelText("Color del contorno"), { target: { value: "#223344" } });
    expect(textOf(store).outline).toEqual({ on: true, width: 6.5, color: "#223344" });

    fireEvent.change(screen.getByLabelText("Curvatura"), { target: { value: "-40" } });
    expect(textOf(store).curvature).toBe(-40);
    fireEvent.change(screen.getByLabelText("Interlineado"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Espaciado letras"), { target: { value: "0.2" } });
    fireEvent.change(screen.getByLabelText("Tamaño"), { target: { value: "60" } });
    expect(textOf(store)).toMatchObject({ lineHeight: 1.5, letterSpacing: 0.2 });
    expect(textOf(store).runs[0]!.fontSizePt).toBe(60);
    await user.click(screen.getByRole("switch", { name: "Sombra" }));
    expect(textOf(store).shadow.on).toBe(false);
  });

  it("textura: subir la imagen, quedarse con el recurso en el documento y quitarla", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addAndWrite(user, store, "Texturado");
    await user.upload(screen.getByLabelText("Subir textura"), png(400, 400));
    await waitFor(() => expect(textOf(store).texture).toEqual({ assetId: "id3" }));
    expect(store.getState().history.present.assets.find((a) => a.id === "id3")).toMatchObject({ kind: "image", metadata: { widthPx: 400 } });
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(textOf(store).texture).toBeUndefined();
  });

  it("cada cambio de peso o tamaño es un único paso de historial", async () => {
    const user = userEvent.setup();
    const { store } = await mount();
    await addAndWrite(user, store, "Uno");
    const before = store.getState().history.past.length;
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "600" } });
    expect(store.getState().history.past.length).toBe(before + 1);
    expect(textOf(store).runs[0]!.weight).toBe(600);
  });
});

describe("panel de texto: fuentes", () => {
  it("elegir una fuente del catálogo la pide al registro y la aplica", async () => {
    const user = userEvent.setup();
    const { store, fonts } = await mount();
    await addAndWrite(user, store, "Fuente");
    await user.click(screen.getByRole("button", { name: /Oswald/ }));
    expect(textOf(store).runs[0]!.fontFamily).toBe("Oswald");
    await waitFor(() => expect(fonts.stateOf("Oswald")).toBe("loaded"));
  });

  it("subir una fuente válida la guarda como recurso y la aplica; una corrupta avisa y no guarda", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const bad: FontEnv = { addFace: async (f) => { if (f === "Mala") throw new Error("corrupta"); }, loadCatalog: async () => true };
    const { store } = await mount({ env: bad });
    await addAndWrite(user, store, "Subida");
    await user.upload(screen.getByLabelText("Subir fuente"), ttf("Buena.ttf"));
    await waitFor(() => expect(textOf(store).runs[0]!.fontFamily).toBe("Buena"));
    expect(store.getState().history.present.assets.find((a) => a.kind === "font")).toMatchObject({ metadata: { family: "Buena" } });
    expect(within(fontList()).getByRole("button", { name: /Buena/ })).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Subir fuente"), ttf("Mala.ttf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la fuente «Mala»");
    expect(store.getState().history.present.assets.filter((a) => a.kind === "font")).toHaveLength(1);
    await user.upload(screen.getByLabelText("Subir fuente"), new File(["x"], "x.woff"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Formato de fuente no admitido");
  });

  it("una fuente que no carga se identifica en la lista y en un aviso, sin sustitución silenciosa", async () => {
    const user = userEvent.setup();
    const env: FontEnv = { addFace: async () => undefined, loadCatalog: async (f) => f !== "Lora" };
    const { store, fonts } = await mount({ env });
    await addAndWrite(user, store, "Aviso");
    await waitFor(() => expect(screen.getByTestId("font-warning")).toHaveTextContent("No se pudo cargar la fuente «Lora»"));
    expect(within(fontList()).getByRole("button", { name: /Lora/ })).toHaveTextContent("No se pudo cargar");
    const report = fonts.checkFontsReady(store.getState().history.present);
    expect(report).toMatchObject({ ok: false, problems: [{ family: "Lora", reason: "failed" }] });
    await user.click(screen.getByRole("button", { name: /Montserrat/ }));
    await waitFor(() => expect(screen.queryByTestId("font-warning")).not.toBeInTheDocument());
    expect(fonts.checkFontsReady(store.getState().history.present)).toEqual({ ok: true });
  });

  it("al reabrir, las fuentes subidas se recargan desde IndexedDB; si el navegador no las carga quedan en fallo visible", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const first = await mount();
    await addAndWrite(user, first.store, "Persistente");
    await user.upload(screen.getByLabelText("Subir fuente"), ttf("Mia.ttf"));
    await waitFor(() => expect(textOf(first.store).runs[0]!.fontFamily).toBe("Mia"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByText("Guardado")).toBeInTheDocument());
    cleanup();
    const loaded = vi.fn(async () => undefined);
    const again = await mount({ reuse: true, env: { addFace: loaded, loadCatalog: async () => true } });
    await waitFor(() => expect(again.fonts.stateOf("Mia"), String(again.fonts.failureOf("Mia"))).toBe("loaded"));
    expect(loaded).toHaveBeenCalledWith("Mia", expect.anything());
    cleanup();
    const broken = await mount({ reuse: true, env: { addFace: async () => { throw new Error("no"); }, loadCatalog: async () => true } });
    await waitFor(() => expect(broken.fonts.stateOf("Mia")).toBe("failed"));
    expect(await screen.findByTestId("font-warning")).toHaveTextContent("«Mia»");
  });
});
