// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage, type ProjectStorage } from "../src/storage/projectStorage";

let n = 0;
let dbName: string;
const downloadParts = vi.fn();

async function mount(storage?: ProjectStorage) {
  let i = 0;
  const store = createEditorStore({ storage: storage ?? (await openStorage(dbName)), newId: () => `id${++i}-${Math.random()}`, downloadParts });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}

beforeEach(() => {
  dbName = `app-db-${++n}`;
  localStorage.clear();
  downloadParts.mockClear();
});
afterEach(cleanup);

describe("App", () => {
  it("pinta el layout de tres columnas con sus placeholders", async () => {
    await mount();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getAllByRole("complementary")).toHaveLength(2);
    expect(screen.getByTestId("dims")).toHaveTextContent("6 × 9 in");
    expect(screen.getByTestId("canvas-placeholder")).toBeInTheDocument();
  });

  it("cambia de idioma sin recargar, lo recuerda y no toca la revisión", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const rev = store.getState().history.present.revision;
    expect(screen.getByText("Capas de texto")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "CA" }));
    expect(screen.getByText("Capes de text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desa" })).toBeInTheDocument();
    expect(localStorage.getItem("kdp.lang")).toBe("ca");
    expect(store.getState().history.present.revision).toBe(rev);
    expect(JSON.stringify(store.getState().history.present)).not.toContain('"ca"');
  });

  it("añade una capa, guarda, y tras recargar la recupera", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    expect(screen.getByText("Texto nuevo")).toBeInTheDocument();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByText("Guardado")).toBeInTheDocument());
    cleanup();

    await mount();
    expect(await screen.findByText("Texto nuevo")).toBeInTheDocument();
  });

  it("deshacer y rehacer desde la cabecera", async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByText("Texto nuevo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(screen.getByText("Texto nuevo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Eliminar capa" }));
    expect(screen.queryByText("Texto nuevo")).not.toBeInTheDocument();
  });

  it("error de cuota: mensaje explícito, estado en memoria y descarga de copia", async () => {
    const user = userEvent.setup();
    const real = await openStorage(dbName);
    await mount({ ...real, saveProject: async () => ({ ok: false, kind: "quota", message: "" }) });
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No queda espacio");
    expect(screen.getByText("Texto nuevo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Descargar copia de seguridad" }));
    await waitFor(() => expect(downloadParts).toHaveBeenCalledTimes(1));
  });
});

describe("IndexedDB no disponible", () => {
  it("la app arranca en modo memoria con aviso visible y permite editar", async () => {
    const user = userEvent.setup();
    const { openStorageOrFallback } = await import("../src/storage/projectStorage");
    const { storage, available } = await openStorageOrFallback(() => Promise.reject(new Error("denegado")));
    const store = createEditorStore({ storage, storageAvailable: available, newId: () => `m${Math.random()}`, downloadParts });
    render(<I18nProvider><App store={store} /></I18nProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo abrir el almacenamiento");
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    expect(screen.getByText("Texto nuevo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
