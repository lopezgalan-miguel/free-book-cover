// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TextElement } from "@free-book-cover/core";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

// Copiar, pegar y duplicar capas desde el panel y con el teclado (U-04).
let n = 0;
const text = (id: string): TextElement => ({
  id, type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
  align: "center", lineHeight: 1.2, letterSpacing: 0.02,
  shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
});
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`clipui-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  store.dispatch({ type: "addElement", element: text("t") });
  store.select("t");
  return store;
}
const count = (s: Awaited<ReturnType<typeof mount>>) => s.getState().history.present.elements.length;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("U-04 copiar, pegar y duplicar", () => {
  it("los botones de Posición y tamaño copian, pegan y duplican", async () => {
    const user = userEvent.setup();
    const store = await mount();
    const paste = screen.getByRole("button", { name: "Pegar" });
    expect(paste).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(paste).toBeEnabled();
    await user.click(paste);
    await waitFor(() => expect(count(store)).toBe(2));
    await user.click(screen.getByRole("button", { name: "Duplicar" }));
    await waitFor(() => expect(count(store)).toBe(3));
  });
  it.each(["ctrlKey", "metaKey"] as const)("%s+C y +V con el foco en el documento copian y pegan", async (mod) => {
    const store = await mount();
    fireEvent.keyDown(document.body, { key: "c", [mod]: true });
    expect(store.canPaste()).toBe(true);
    fireEvent.keyDown(document.body, { key: "v", [mod]: true });
    await waitFor(() => expect(count(store)).toBe(2));
  });
  it("no hace nada con el foco en un campo ni con un diálogo abierto", async () => {
    const store = await mount();
    const input = screen.getAllByRole("spinbutton")[0]!;
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(store.canPaste()).toBe(false);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
    expect(store.canPaste()).toBe(false);
    fireEvent.keyDown(document.body, { key: "d", ctrlKey: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(count(store)).toBe(1);
    dialog.remove();
  });
  it("Ctrl+V sin portapapeles no se cancela; Ctrl+D duplica y cancela el evento", async () => {
    const store = await mount();
    const paste = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
    const dup = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(dup);
    expect(dup.defaultPrevented).toBe(true);
    await waitFor(() => expect(count(store)).toBe(2));
  });
});
