// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset } from "@free-book-cover/core";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { createBackupParts } from "../src/storage/backup";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
let dbName = "";
const img = (id: string): Asset => ({ id, kind: "image", mimeType: "image/png", metadata: {} });
async function mount(prefix = "id") {
  let i = 0;
  dbName = `prj-${++n}`;
  const store = createEditorStore({ storage: await openStorage(dbName), newId: () => `${prefix}${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("project-open"));
  return screen.getByRole("dialog", { name: "Proyecto" });
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("diálogo de proyecto (I-5)", () => {
  it("renombrar cambia el documento por comando y se refleja en la cabecera", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const dlg = await openDialog(user);
    const field = within(dlg).getByLabelText("Nombre del proyecto");
    await user.type(field, "Mi novela");
    await user.keyboard("{Enter}");
    expect(store.getState().history.present.name).toBe("Mi novela");
    expect(screen.getByTestId("project-open")).toHaveTextContent("Mi novela");
    store.undo();
    expect(store.getState().history.present.name).toBe("");
  });
  it("crea un proyecto nuevo y abre de nuevo el anterior desde la lista", async () => {
    const user = userEvent.setup();
    const store = await mount();
    store.setName("Primero");
    const first = store.getState().history.present.id;
    const dlg = await openDialog(user);
    await user.click(within(dlg).getByRole("button", { name: "Nuevo proyecto" }));
    await waitFor(() => expect(store.getState().history.present.id).not.toBe(first));
    expect(store.getState().history.present.name).toBe("");
    await waitFor(() => expect(within(dlg).getAllByTestId("saved-project")).toHaveLength(1));
    await user.click(within(dlg).getByRole("button", { name: "Abrir Primero" }));
    await waitFor(() => expect(store.getState().history.present.id).toBe(first));
  });
  it("borrar un proyecto guardado pide confirmación", async () => {
    const user = userEvent.setup();
    const store = await mount();
    store.setName("Viejo");
    const old = store.getState().history.present.id;
    await store.newProject("Actual");
    const dlg = await openDialog(user);
    await user.click(await within(dlg).findByRole("button", { name: "Borrar Viejo" }));
    expect(within(dlg).getByRole("alert")).toHaveTextContent("¿Borrar «Viejo»");
    await user.click(within(dlg).getByRole("button", { name: "Cancelar" }));
    expect((await store.listProjects()).map((p) => p.id)).toContain(old);
    await user.click(within(dlg).getByRole("button", { name: "Borrar Viejo" }));
    await user.click(within(dlg).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(async () => expect((await store.listProjects()).map((p) => p.id)).not.toContain(old));
  });
  it("«liberar espacio» muestra lo que se quitará, pide confirmación y libera", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await store.addAsset(img("bg1"), new Blob([new Uint8Array(2000)]));
    store.dispatch({ type: "setBackground", background: { assetId: "bg1" } });
    await store.addAsset(img("bg2"), new Blob([new Uint8Array(1000)]));
    store.dispatch({ type: "setBackground", background: { assetId: "bg2" } });
    const dlg = await openDialog(user);
    expect(within(dlg).getByTestId("space-unused")).toHaveTextContent("Recursos sin uso: 1");
    await user.click(within(dlg).getByRole("button", { name: "Liberar espacio" }));
    expect(within(dlg).getByRole("alert")).toHaveTextContent("vaciará el historial");
    // Cancelar no toca nada.
    await user.click(within(dlg).getByRole("button", { name: "Cancelar" }));
    expect(store.getState().assets).toHaveLength(2);
    await user.click(within(dlg).getByRole("button", { name: "Liberar espacio" }));
    await user.click(within(dlg).getByRole("button", { name: "Sí, liberar" }));
    await waitFor(() => expect(within(dlg).getByTestId("project-note")).toHaveTextContent("Espacio liberado"));
    expect(store.getState().assets.map((a) => a.id)).toEqual(["bg2"]);
    expect(within(dlg).getByTestId("space-unused")).toHaveTextContent("No hay recursos sin uso");
    expect(within(dlg).getByRole("button", { name: "Liberar espacio" })).toBeDisabled();
  });
  it("importa una copia de seguridad con todas sus partes y avisa si no es válida", async () => {
    const user = userEvent.setup();
    const src = createEditorStore({ storage: await openStorage(`src-${n}`), newId: () => "src1", downloadParts: vi.fn() });
    await src.init();
    await src.addAsset(img("a1"), new Blob([new Uint8Array(2500).fill(3)], { type: "image/png" }));
    src.setName("De copia");
    const parts = await createBackupParts(src.getState().history.present, src.getState().assets, 1200);
    const store = await mount();
    const dlg = await openDialog(user);
    const input = within(dlg).getByLabelText("Importar copia…");
    fireEvent.change(input, { target: { files: [new File(["no es una copia"], "x.json", { type: "application/json" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("La copia de seguridad no es válida");
    fireEvent.change(input, { target: { files: parts.map((p) => new File([p.blob], p.filename, { type: "application/json" })) } });
    await waitFor(() => expect(store.getState().history.present.name).toBe("De copia"));
    expect(within(dlg).getByTestId("project-note")).toHaveTextContent("Copia restaurada");
    expect(store.getState().assets.map((a) => a.id)).toEqual(["a1"]);
  });
  it("en catalán el diálogo está traducido", async () => {
    localStorage.setItem("lang", "ca");
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("radio", { name: "CA" }));
    await user.click(screen.getByTestId("project-open"));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("button", { name: "Projecte nou" })).toBeInTheDocument();
    expect(within(dlg).getByRole("button", { name: "Allibera espai" })).toBeInTheDocument();
  });
  it("en el contenedor móvil el mismo diálogo está disponible desde la barra superior", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    const user = userEvent.setup();
    await mount();
    const dlg = await openDialog(user);
    expect(within(dlg).getByRole("button", { name: "Liberar espacio" })).toBeInTheDocument();
  });
});
