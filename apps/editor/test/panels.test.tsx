// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";
import { importImage } from "../src/images/importImage";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, name = "foto.png") =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0])], name, { type: "image/png" });

let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`pan-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
const noThumb = async () => null;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("fondo", () => {
  it("subir un fondo guarda cabecera y avisa de ppp < 300 con el elemento afectado", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.upload(screen.getByLabelText("Subir imagen"), png(900, 1350));
    await waitFor(() => expect(store.getState().history.present.canvas.background).toEqual({ assetId: "id2" }));
    const warn = await screen.findByTestId("dpi-warning");
    expect(warn).toHaveTextContent("Fondo");
    expect(warn).toHaveTextContent("150 ppp");
    expect(screen.getByRole("button", { name: "Rellenar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Ajustar y Centrar pasan por comandos y se deshacen", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await importImage(store, png(1800, 2700), "background", noThumb);
    await user.click(await screen.findByRole("button", { name: "Ajustar" }));
    expect(store.getState().history.present.canvas.backgroundFit).toBe("contain");
    fireEvent.change(screen.getByLabelText("Posición X (%)"), { target: { value: "20" } });
    fireEvent.blur(screen.getByLabelText("Posición X (%)"));
    expect(store.getState().history.present.canvas.backgroundPos).toEqual({ x: 0.2, y: 0.5 });
    await user.click(screen.getByRole("button", { name: "Centrar" }));
    expect(store.getState().history.present.canvas.backgroundPos).toEqual({ x: 0.5, y: 0.5 });
    store.undo();
    expect(store.getState().history.present.canvas.backgroundPos).toEqual({ x: 0.2, y: 0.5 });
    expect(screen.queryByTestId("dpi-warning")).not.toBeInTheDocument(); // 1800x2700 en 6x9 = 300 ppp
  });

  it("un archivo que no es imagen muestra un aviso y no cambia el documento", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const store = await mount();
    await user.upload(screen.getByLabelText("Subir imagen"), new File(["hola"], "a.txt", { type: "text/plain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Formato de imagen no admitido");
    expect(store.getState().history.present.revision).toBe(0);
  });

  it("supera 80 Mpx: aviso de límite leyendo solo la cabecera", async () => {
    const user = userEvent.setup();
    await mount();
    await user.upload(screen.getByLabelText("Subir imagen"), png(10000, 9000));
    expect(await screen.findByRole("alert")).toHaveTextContent("80 megapíxeles");
  });
});

describe("lienzo", () => {
  it("un preajuste aplica su tamaño en pulgadas (300 ppp) con undo", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: /Kindle/ }));
    const c = store.getState().history.present.canvas;
    expect(c.widthIn).toBeCloseTo(1600 / 300, 9);
    expect(c.heightIn).toBeCloseTo(2560 / 300, 9);
    store.undo();
    expect(store.getState().history.present.canvas).toMatchObject({ widthIn: 6, heightIn: 9 });
  });

  it("tamaño libre en mm con política estirar sobre el fondo, en un solo deshacer", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await importImage(store, png(1800, 2700), "background", noThumb);
    await user.selectOptions(screen.getByLabelText("Unidad"), "mm");
    await user.clear(screen.getByLabelText(/^ANCHO/));
    await user.type(screen.getByLabelText(/^ANCHO/), "254");
    await user.clear(screen.getByLabelText(/^ALTO/));
    await user.type(screen.getByLabelText(/^ALTO/), "254");
    await user.click(screen.getByRole("radio", { name: "Estirar" }));
    await user.click(screen.getByRole("button", { name: "Aplicar tamaño" }));
    const d = store.getState().history.present;
    expect(d.canvas).toMatchObject({ widthIn: 10, heightIn: 10, backgroundFit: "fill" });
    store.undo();
    const u = store.getState().history.present;
    expect(u.canvas).toMatchObject({ widthIn: 6, heightIn: 9 });
    expect(u.canvas.backgroundFit).toBeUndefined();
  });

  it("rechaza tamaños inválidos con un mensaje y sin tocar el documento", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const rev = store.getState().history.present.revision;
    await user.clear(screen.getByLabelText(/^ANCHO/));
    await user.type(screen.getByLabelText(/^ANCHO/), "0");
    await user.click(screen.getByRole("button", { name: "Aplicar tamaño" }));
    expect(screen.getByRole("alert")).toHaveTextContent("tamaño válido");
    expect(store.getState().history.present.revision).toBe(rev);
  });
});

describe("capas y alternativa numérica", () => {
  it("reordena capas con teclado y las elimina", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await importImage(store, png(300, 300, "uno.png"), "layer", noThumb);
    await importImage(store, png(300, 300, "dos.png"), "layer", noThumb);
    const z = (id: string) => store.getState().history.present.elements.find((e) => e.id === id)!.zIndex;
    const [first, second] = store.getState().history.present.elements.map((e) => e.id);
    expect(z(second!)).toBeGreaterThan(z(first!));
    const row = screen.getByText("dos.png").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Bajar capa" }));
    expect(z(second!)).toBeLessThan(z(first!));
    await user.click(within(row).getByRole("button", { name: "Eliminar capa" }));
    expect(store.getState().history.present.elements).toHaveLength(1);
  });

  it("mueve, redimensiona y gira con campos numéricos etiquetados", async () => {
    const store = await mount();
    await importImage(store, png(600, 900), "layer", noThumb);
    const x = await screen.findByLabelText("X (in)");
    fireEvent.change(x, { target: { value: "2.5" } });
    fireEvent.blur(x);
    const rot = screen.getByLabelText("Rotación (°)");
    fireEvent.change(rot, { target: { value: "30" } });
    fireEvent.keyDown(rot, { key: "Enter" });
    const el = store.getState().history.present.elements[0]!;
    expect(el).toMatchObject({ x: 2.5, rotation: 30 });
    fireEvent.change(screen.getByLabelText("Recorte ancho"), { target: { value: "50" } });
    fireEvent.blur(screen.getByLabelText("Recorte ancho"));
    const img = store.getState().history.present.elements[0]!;
    expect(img.type === "image" && img.crop.width).toBe(0.5);
    // 600 px recortados a 300 sobre una caja de ~3.6 in: ppp efectivos bajos y visibles
    expect(await screen.findByTestId("dpi-warning")).toHaveTextContent("ppp");
  });

  it("textos en catalán", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("radio", { name: "CA" }));
    expect(screen.getByText("Imatges")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplica la mida" })).toBeInTheDocument();
  });
});
