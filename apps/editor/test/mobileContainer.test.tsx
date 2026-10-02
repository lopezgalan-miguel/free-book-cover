// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

let n = 0;
function setViewport(mobile: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: mobile && q.includes("max-width"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
}
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`mob-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("selección de contenedor", () => {
  it("en escritorio no hay barra de pestañas y están los paneles laterales", async () => {
    setViewport(false);
    await mount();
    expect(screen.queryByTestId("tab-text")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Subir imagen")).toBeInTheDocument();
  });

  it("sin matchMedia se usa escritorio", async () => {
    vi.stubGlobal("matchMedia", undefined);
    await mount();
    expect(screen.queryByTestId("tab-text")).not.toBeInTheDocument();
  });

  it("en móvil hay cinco pestañas y los paneles solo existen con la hoja abierta", async () => {
    setViewport(true);
    await mount();
    for (const name of ["Texto", "Fuente", "Color", "Estilo", "Lienzo"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByLabelText("Subir imagen")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("hoja inferior", () => {
  it("la pestaña Lienzo reutiliza los paneles de fondo y tamaño", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByTestId("tab-canvas"));
    const sheet = screen.getByRole("dialog", { name: "Lienzo" });
    expect(within(sheet).getByLabelText("Subir imagen")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Aplicar tamaño" })).toBeInTheDocument();
  });

  it("sin texto seleccionado las pestañas de texto explican qué hacer", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByTestId("tab-font"));
    expect(screen.getByRole("dialog", { name: "Fuente" })).toHaveTextContent("Selecciona una capa de texto");
  });

  it("añadir un texto desde la pestaña Texto muestra su editor y se aplica por comandos", async () => {
    setViewport(true);
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByTestId("tab-text"));
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    expect(store.getState().history.present.elements).toHaveLength(1);
    const area = screen.getByLabelText("Contenido del texto");
    await user.clear(area);
    await user.type(area, "Hola");
    expect(store.getState().history.present.elements[0]).toMatchObject({ runs: [{ text: "Hola" }] });
    await user.click(screen.getByRole("button", { name: "Hecho" }));
    await user.click(screen.getByTestId("tab-color"));
    await user.click(screen.getByRole("button", { name: /Muestra #B4453A/i }));
    expect(store.getState().history.present.elements[0]).toMatchObject({ runs: [{ color: "#b4453a" }] });
  });

  it("Escape cierra la hoja y devuelve el foco a la pestaña", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    const tab = screen.getByTestId("tab-style");
    tab.focus();
    await user.click(tab);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tab).toHaveFocus();
  });

  it("el foco queda atrapado: Tab desde el último control vuelve al primero", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByTestId("tab-canvas"));
    const sheet = screen.getByRole("dialog");
    const focusables = [...sheet.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
    focusables[focusables.length - 1]!.focus();
    await user.tab();
    expect(focusables[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(focusables[focusables.length - 1]).toHaveFocus();
  });

  it("tocar el fondo cierra la hoja; Hecho también", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByTestId("tab-canvas"));
    await user.click(screen.getByRole("button", { name: "Hecho" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("tab-canvas"));
    const bd = screen.getByTestId("sheet-backdrop");
    bd.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("las flechas mueven el foco entre pestañas", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    screen.getByTestId("tab-text").focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("tab-font")).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByTestId("tab-canvas")).toHaveFocus();
  });

  it("en móvil el diálogo de exportación sigue ofreciendo PNG y explica el PDF si es KDP sin companion", async () => {
    setViewport(true);
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    expect(screen.getByRole("dialog", { name: /Exportar/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /PNG/ })).toBeInTheDocument();
  });
});
