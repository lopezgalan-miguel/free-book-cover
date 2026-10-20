// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TextElement, TextMeasure } from "@free-book-cover/core";
import { FontRegistry, type FontEnv } from "../src/fonts/fontRegistry";
import { FontsProvider } from "../src/fonts/fontContext";
import { StoreProvider } from "../src/store/react";
import { createEditorStore } from "../src/store/editorStore";
import { openStorage } from "../src/storage/projectStorage";
import { useTextFit } from "../src/canvas/useTextFit";

// A 300 ppp, 72 pt = 300 px y cada carácter mide 0,5 in.
const measure: TextMeasure = (text, css) => text.length * Number(/([\d.]+)px/.exec(css)![1]) * 0.5;
const run = (family: string) => ({ text: "abcdef", fontFamily: family, fontSizePt: 72, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" });
const textEl = (id: string, family = "Georgia", visible = true): TextElement => ({
  id, type: "text", x: 2, y: 1, width: 1, height: 3, rotation: 0, zIndex: 0, visible, runs: [run(family)], align: "center", lineHeight: 1, letterSpacing: 0,
  shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
});

let n = 0;
async function setup(el: TextElement, opts: { catalog?: Promise<boolean>; m?: TextMeasure | null } = {}) {
  let i = 0;
  const store = createEditorStore({ storage: await openStorage(`fit-${++n}`), newId: () => `id${++i}`, downloadParts: vi.fn() });
  await store.init();
  store.dispatch({ type: "addElement", element: el });
  const env: FontEnv = { async addFace() {}, loadCatalog: () => opts.catalog ?? Promise.resolve(true) };
  const registry = new FontRegistry(env);
  const m = opts.m === undefined ? measure : opts.m;
  function Probe() { useTextFit({ measure: m }); return null; }
  const wrap = (c: ReactNode) => <StoreProvider store={store}><FontsProvider registry={registry}>{c}</FontsProvider></StoreProvider>;
  return { store, registry, ui: wrap(<Probe />) };
}
const get = (s: Awaited<ReturnType<typeof setup>>["store"], id = "t") => s.getState().history.present.elements.find((e) => e.id === id)!;
afterEach(cleanup);

describe("useTextFit", () => {
  it("corrige alto y ancho sin añadir paso de deshacer", async () => {
    const { store, ui } = await setup(textEl("t"));
    const past = store.getState().history.past.length;
    const rev = store.getState().history.present.revision;
    render(ui);
    expect(get(store)).toMatchObject({ width: 3, height: 1, x: 1 });
    expect(store.getState().history.past.length).toBe(past);
    expect(store.getState().history.present.revision).toBe(rev + 1);
  });

  it("espera a que cargue la fuente", async () => {
    let done!: (v: boolean) => void;
    const catalog = new Promise<boolean>((r) => { done = r; });
    const { store, registry, ui } = await setup(textEl("t", "Lora"), { catalog });
    registry.ensureDoc(store.getState().history.present);
    expect(registry.stateOf("Lora")).toBe("loading");
    render(ui);
    expect(get(store)).toMatchObject({ width: 1, height: 3, x: 2 });
    await act(async () => { done(true); await catalog; });
    expect(get(store)).toMatchObject({ width: 3, height: 1, x: 1 });
  });

  it("no toca capas ocultas", async () => {
    const { store, ui } = await setup(textEl("t", "Georgia", false));
    render(ui);
    expect(get(store)).toMatchObject({ width: 1, height: 3, x: 2 });
  });

  it("sin medidor no hace nada", async () => {
    const { store, ui } = await setup(textEl("t"), { m: null });
    render(ui);
    expect(get(store)).toMatchObject({ width: 1, height: 3 });
  });

  it("un solo ajuste por cambio", async () => {
    let calls = 0;
    const shifting: TextMeasure = (t, css) => measure(t, css) + ++calls * 7;
    const { store, ui } = await setup(textEl("t"), { m: shifting });
    const spy = vi.spyOn(store, "amend");
    render(ui);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
