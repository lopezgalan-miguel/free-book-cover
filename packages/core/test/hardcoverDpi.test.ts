import { describe, expect, it } from "vitest";
import { applyCommand, hardcoverLowDpi, lowDpiForSetup, type PrintSetup, type Project } from "../src/index.js";
import { baseProject, textEl } from "./fixtures.js";

const hard: PrintSetup = { trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream", readingDirection: "ltr", binding: "hardcover" };
const soft: PrintSetup = { trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream", readingDirection: "ltr" };

const withBackground = (widthPx: number, heightPx: number): Project => {
  const p = baseProject();
  return {
    ...p,
    assets: [{ id: "bg", kind: "image", mimeType: "image/png", metadata: { widthPx, heightPx } }],
    canvas: { ...p.canvas, background: { assetId: "bg" } },
  };
};

describe("lowDpiForSetup", () => {
  it("un fondo de 1600 × 2560 no llega a 300 ppp en la tapa dura de 5,5 × 8,5", () => {
    const low = lowDpiForSetup(withBackground(1600, 2560), hard);
    expect(low).toHaveLength(1);
    expect(low[0]!.id).toBe("background");
    expect(low[0]!.dpi).toBeLessThan(300);
  });
  it("un fondo de 4000 × 3100 sí llega", () => {
    expect(lowDpiForSetup(withBackground(4000, 3100), hard)).toEqual([]);
  });
  it("cuenta también la textura de un texto", () => {
    const p = withBackground(4000, 3100);
    const doc: Project = {
      ...p,
      assets: [...p.assets, { id: "tx", kind: "image", mimeType: "image/png", metadata: { widthPx: 100, heightPx: 100 } }],
      elements: [textEl("t1", { texture: { assetId: "tx" } })],
    };
    expect(lowDpiForSetup(doc, hard).map((e) => e.id)).toEqual(["t1"]);
  });
});

describe("tapa dura: mínimo de 300 ppp", () => {
  it("setPrintSetup rechaza la tapa dura si alguna imagen no llega y no cambia el documento", () => {
    const p = withBackground(1600, 2560);
    const r = applyCommand(p, { type: "setPrintSetup", printSetup: hard }, p.revision);
    expect(r).toEqual({ ok: false, error: { kind: "invalid", issues: ["printSetup: low_dpi"] } });
  });
  it("la tapa blanda con la misma imagen se sigue aceptando (solo avisa la preimpresión)", () => {
    const p = withBackground(1600, 2560);
    expect(applyCommand(p, { type: "setPrintSetup", printSetup: soft }, p.revision).ok).toBe(true);
  });
  it("hardcoverLowDpi: lista las imágenes bajas solo en tapa dura", () => {
    const p = withBackground(4000, 3100);
    const r = applyCommand(p, { type: "setPrintSetup", printSetup: hard }, p.revision);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(hardcoverLowDpi(r.doc)).toEqual([]);
    // Después se cambia el fondo por uno pequeño (se pierden los 300 ppp).
    const shrunk: Project = { ...r.doc, assets: [{ id: "bg", kind: "image", mimeType: "image/png", metadata: { widthPx: 1600, heightPx: 2560 } }] };
    expect(hardcoverLowDpi(shrunk).map((e) => e.id)).toEqual(["background"]);
    const s = applyCommand(withBackground(1600, 2560), { type: "setPrintSetup", printSetup: soft }, 0);
    if (!s.ok) throw new Error("x");
    expect(hardcoverLowDpi(s.doc)).toEqual([]);
  });
});
