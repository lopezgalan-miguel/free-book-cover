import { describe, expect, it } from "vitest";
import { applyCommand, type Project } from "../src/index.js";
import { baseProject } from "./fixtures.js";

const withBg = (): Project => ({
  ...baseProject(),
  assets: [{ id: "a1", kind: "image", mimeType: "image/png", metadata: { widthPx: 600, heightPx: 900 } }],
  canvas: { ...baseProject().canvas, background: { assetId: "a1" } },
});

describe("setBackgroundFilters", () => {
  it("fija los filtros del fondo y null los quita", () => {
    const p = withBg();
    const r = applyCommand(p, { type: "setBackgroundFilters", filters: { blur: 20, brightness: 60 } }, p.revision);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.doc.canvas.backgroundFilters).toEqual({ blur: 20, brightness: 60 });
    const r2 = applyCommand(r.doc, { type: "setBackgroundFilters", filters: null }, r.doc.revision);
    if (!r2.ok) throw new Error("x");
    expect("backgroundFilters" in r2.doc.canvas).toBe(false);
  });
  it("rechaza valores fuera de rango sin tocar el documento", () => {
    const p = withBg();
    const r = applyCommand(p, { type: "setBackgroundFilters", filters: { blur: 500 } }, p.revision);
    expect(r.ok).toBe(false);
  });
  it("cambiar la imagen de fondo conserva los filtros", () => {
    const p = { ...withBg(), canvas: { ...withBg().canvas, backgroundFilters: { blur: 10 } } };
    const r = applyCommand(p, { type: "setBackground", background: "#000000" }, p.revision);
    if (!r.ok) throw new Error("x");
    expect(r.doc.canvas.backgroundFilters).toEqual({ blur: 10 });
  });
});
