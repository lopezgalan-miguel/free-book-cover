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
import { importImage } from "../src/images/importImage";
import { generateTextureAsset } from "../src/images/generateTexture";

// En Node no hay canvas para codificar el PNG: el generador se sustituye por la importación de un PNG de 1024 px.
vi.mock("../src/images/generateTexture", () => ({
  generateTextureAsset: vi.fn(async (store: Parameters<typeof importImage>[0]) => importImage(store, png(1024, 1024), "asset", async () => null)),
}));

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0])], "tex.png", { type: "image/png" });
const okEnv = (): FontEnv => ({ addFace: async () => undefined, loadCatalog: async () => true });
let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`fx-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} fonts={new FontRegistry(okEnv())} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
type Store = Awaited<ReturnType<typeof mount>>;
const textOf = (store: Store) => store.getState().history.present.elements[0] as TextElement;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function textWithTexture(user: ReturnType<typeof userEvent.setup>, store: Store) {
  await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
  fireEvent.change(await screen.findByLabelText("Contenido del texto"), { target: { value: "Grietas" } });
  await user.upload(screen.getByLabelText("Subir textura"), png(400, 400));
  await waitFor(() => expect(textOf(store).texture).toEqual({ assetId: "id3" }));
  await user.click(within(screen.getByRole("group", { name: "Encaje de la textura" })).getByRole("button", { name: "Mosaico" }));
}

describe("panel de texto: acabado de las letras", () => {
  it("«Recortar con la textura» crea una máscara enlazada a la textura", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await textWithTexture(user, store);
    await user.click(screen.getByRole("switch", { name: "Recortar con la textura" }));
    expect(textOf(store).mask).toEqual({ assetId: "id3", fit: "tile", tileIn: 1, mode: "dark", threshold: 0.35, softness: 0.1 });
    fireEvent.change(screen.getByLabelText("Modo del recorte"), { target: { value: "alpha" } });
    fireEvent.change(screen.getByLabelText("Umbral del recorte"), { target: { value: "0.6" } });
    expect(textOf(store).mask).toMatchObject({ mode: "alpha", threshold: 0.6 });
    await user.click(screen.getByRole("switch", { name: "Recortar con la textura" }));
    expect(textOf(store).mask).toBeUndefined();
  });

  it("con la máscara enlazada, cambiar el encaje de la textura la mueve también en un solo paso", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await textWithTexture(user, store);
    await user.click(screen.getByRole("switch", { name: "Recortar con la textura" }));
    const before = store.getState().history.past.length;
    fireEvent.change(screen.getByLabelText("Tamaño de tesela"), { target: { value: "0.5" } });
    expect(textOf(store).texture?.tileIn).toBe(0.5);
    expect(textOf(store).mask?.tileIn).toBe(0.5);
    expect(store.getState().history.past.length).toBe(before + 1);
    // Sustituir la imagen de la textura arrastra la máscara enlazada.
    await user.upload(screen.getByLabelText("Subir textura"), png(200, 200));
    await waitFor(() => expect(textOf(store).texture?.assetId).toBe("id4"));
    expect(textOf(store).mask).toMatchObject({ assetId: "id4", tileIn: 0.5, mode: "dark" });
  });

  it("sombra interior con valores por defecto y sombra con color, opacidad, ángulo y distancia", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.click(screen.getByRole("switch", { name: "Sombra interior" }));
    expect(textOf(store).innerShadow).toEqual({ on: true, color: "#000000", opacity: 0.6, angle: 90, distance: 0.03, blur: 0.06 });
    fireEvent.change(screen.getByLabelText("Desenfoque de la sombra interior"), { target: { value: "0.1" } });
    expect(textOf(store).innerShadow?.blur).toBe(0.1);
    await user.click(screen.getByRole("switch", { name: "Sombra" }));
    fireEvent.change(screen.getByLabelText("Ángulo de la sombra"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Distancia de la sombra"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("Opacidad de la sombra"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Color de la sombra"), { target: { value: "#330000" } });
    expect(textOf(store).shadow).toEqual({ on: true, intensity: 40, angle: 45, distance: 0.1, opacity: 0.9, color: "#330000" });
  });

  it("una máscara propia se sube aparte y no sigue a la textura", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await textWithTexture(user, store);
    await user.upload(screen.getByLabelText("Subir máscara"), png(300, 300));
    await waitFor(() => expect(textOf(store).mask).toEqual({ assetId: "id4", mode: "dark", threshold: 0.35, softness: 0.1 }));
    fireEvent.change(screen.getByLabelText("Tamaño de tesela"), { target: { value: "0.5" } });
    expect(textOf(store).mask).toEqual({ assetId: "id4", mode: "dark", threshold: 0.35, softness: 0.1 });
    await user.click(screen.getByRole("button", { name: "Quitar máscara" }));
    expect(textOf(store).mask).toBeUndefined();
  });

  it("«Generar textura» crea la textura en mosaico y, en mármol con huecos, la máscara enlazada por transparencia", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    fireEvent.change(screen.getByLabelText("Semilla"), { target: { value: "42" } });
    fireEvent.blur(screen.getByLabelText("Semilla"));
    await user.click(screen.getByRole("button", { name: "Generar textura" }));
    await waitFor(() => expect(textOf(store).texture).toEqual({ assetId: "id3", fit: "tile", tileIn: 1.5 }));
    expect(vi.mocked(generateTextureAsset)).toHaveBeenLastCalledWith(expect.anything(), { kind: "cracked-marble", seed: 42, cracks: "holes" });
    expect(textOf(store).mask).toEqual({ assetId: "id3", fit: "tile", tileIn: 1.5, mode: "alpha", threshold: 0.5, softness: 0 });
    fireEvent.change(screen.getByLabelText("Tipo de textura"), { target: { value: "paper" } });
    await user.click(screen.getByRole("button", { name: "Generar textura" }));
    await waitFor(() => expect(textOf(store).texture?.assetId).toBe("id4"));
    expect(vi.mocked(generateTextureAsset)).toHaveBeenLastCalledWith(expect.anything(), { kind: "paper", seed: 42 });
  });
  it("en mármol se pueden pedir grietas pintadas de un color: sin máscara", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    fireEvent.change(screen.getByLabelText("Grietas"), { target: { value: "lines" } });
    fireEvent.change(screen.getByLabelText("Color de las grietas"), { target: { value: "#a8222a" } });
    await user.click(screen.getByRole("button", { name: "Generar textura" }));
    await waitFor(() => expect(textOf(store).texture).toEqual({ assetId: "id3", fit: "tile", tileIn: 1.5 }));
    expect(vi.mocked(generateTextureAsset)).toHaveBeenLastCalledWith(expect.anything(), { kind: "cracked-marble", seed: 1, cracks: "lines", crackColor: "#a8222a" });
    expect(textOf(store).mask).toBeUndefined();
  });
});
