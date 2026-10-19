// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TextElement } from "@free-book-cover/core";
import { App } from "../src/App";
import { FontRegistry } from "../src/fonts/fontRegistry";
import { I18nProvider } from "../src/i18n";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";

// TTF mínimo con fvar: wght 100..900 (400) y wdth 50..150 (100).
function variableTtf(): File {
  const axes: Array<[string, number, number, number]> = [["wght", 100, 400, 900], ["wdth", 50, 100, 150]];
  const fvarLen = 16 + axes.length * 20;
  const buf = new Uint8Array(28 + fvarLen);
  const dv = new DataView(buf.buffer);
  buf.set([0, 1, 0, 0], 0);
  dv.setUint16(4, 1);
  buf.set([0x66, 0x76, 0x61, 0x72], 12);
  dv.setUint32(20, 28);
  dv.setUint32(24, fvarLen);
  dv.setUint16(28 + 4, 16);
  dv.setUint16(28 + 8, axes.length);
  dv.setUint16(28 + 10, 20);
  axes.forEach(([tag, min, def, max], i) => {
    const o = 28 + 16 + i * 20;
    buf.set([...tag].map((c) => c.charCodeAt(0)), o);
    dv.setInt32(o + 4, min * 65536);
    dv.setInt32(o + 8, def * 65536);
    dv.setInt32(o + 12, max * 65536);
  });
  return new File([buf], "Roboto Serif VF.ttf");
}

let n = 0;
async function mount() {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`vf-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  render(<I18nProvider><App store={store} fonts={new FontRegistry({ addFace: async () => undefined, loadCatalog: async () => true })} /></I18nProvider>);
  await waitFor(() => expect(store.getState().ready).toBe(true));
  return store;
}
const textOf = (store: Awaited<ReturnType<typeof mount>>) => store.getState().history.present.elements[0] as TextElement;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("panel de texto: fuente variable", () => {
  it("con ejes wght y wdth ofrece grosor y anchura continuos; la anchura por defecto se borra", async () => {
    const user = userEvent.setup();
    const store = await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    fireEvent.change(await screen.findByLabelText("Contenido del texto"), { target: { value: "LAMENTOS" } });
    await user.upload(screen.getByLabelText("Subir fuente"), variableTtf());
    await waitFor(() => expect(textOf(store).runs[0]!.fontFamily).toBe("Roboto Serif VF"));
    const width = await screen.findByLabelText("Anchura de la fuente (wdth)");
    fireEvent.change(width, { target: { value: "60" } });
    expect(textOf(store).runs[0]!.stretch).toBe(60);
    fireEvent.change(screen.getByLabelText("Grosor (wght)"), { target: { value: "870" } });
    expect(textOf(store).runs[0]!.weight).toBe(870);
    fireEvent.change(width, { target: { value: "100" } });
    expect(textOf(store).runs[0]!.stretch).toBeUndefined();
  });
  it("una fuente del catálogo no muestra controles de ejes", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: "Añadir capa de texto" }));
    expect(screen.queryByLabelText("Anchura de la fuente (wdth)")).toBeNull();
  });
});
