import { describe, expect, it } from "vitest";
import { checkFontsReady, fontCss, fontFamilyFor, layoutText, renderDocument, textEffects, usedStretches, type Project } from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

// Cuerpo de 72 pt a 100 ppp = 100 px de base.
const PPI = 100;
const big = { text: "Hola", fontFamily: "Lora", fontSizePt: 72, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" };
const measure = (t: string) => t.length * 10;

describe("efectos de texto en px", () => {
  it("la sombra de un documento antiguo no cambia", () => {
    const fx = textEffects(textEl("t", { runs: [big], shadow: { on: true, intensity: 40 } }), PPI);
    expect(fx.shadow).toEqual({ dx: 0, dy: 5, blur: 6.4, color: "rgba(0,0,0,0.6)" });
    expect(fx.innerShadow).toBeNull();
  });
  it("color, opacidad, ángulo y distancia configurables", () => {
    const fx = textEffects(textEl("t", { runs: [big], shadow: { on: true, intensity: 40, color: "#ff8000", opacity: 0.5, angle: 0, distance: 0.1 } }), PPI);
    expect(fx.shadow).toEqual({ dx: 10, dy: 0, blur: 6.4, color: "rgba(255,128,0,0.5)" });
  });
  it("sombra interior en px", () => {
    const fx = textEffects(textEl("t", { runs: [big], innerShadow: { on: true, color: "#000000", opacity: 0.6, angle: 270, distance: 0.03, blur: 0.06 } }), PPI);
    expect(fx.innerShadow).toEqual({ dx: 0, dy: -3, blur: 6, color: "rgba(0,0,0,0.6)" });
    const off = textEffects(textEl("t", { runs: [big], innerShadow: { on: false, color: "#000000", opacity: 0.6, angle: 270, distance: 0.03, blur: 0.06 } }), PPI);
    expect(off.innerShadow).toBeNull();
  });
});

describe("anchura de fuentes variables", () => {
  it("la anchura usa un alias de familia en la fuente CSS", () => {
    expect(fontFamilyFor("Roboto Serif")).toBe("Roboto Serif");
    expect(fontFamilyFor("Roboto Serif", 75)).toBe("Roboto Serif @wdth 75");
    expect(fontCss({ family: "Roboto Serif", weight: 900, italic: false, px: 10, stretch: 75 })).toContain('"Roboto Serif @wdth 75"');
    const l = layoutText(textEl("t", { runs: [{ ...big, fontFamily: "Roboto Serif", stretch: 75 }] }), PPI, measure);
    expect(l.lines[0]!.pieces[0]!.style.font).toContain('"Roboto Serif @wdth 75"');
  });
  it("informa de las anchuras usadas y exige que su alias esté cargado", () => {
    const p: Project = {
      ...baseProject(),
      assets: [{ id: "f", kind: "font", mimeType: "font/ttf", metadata: { family: "Roboto Serif" } }],
      elements: [textEl("t", { runs: [{ ...big, fontFamily: "Roboto Serif", stretch: 75 }, { ...big, text: "x", fontFamily: "Roboto Serif" }] })],
    };
    expect(usedStretches(p)).toEqual(new Map([["Roboto Serif", [75]]]));
    const loadedBaseOnly = checkFontsReady(p, (f) => (f === "Roboto Serif" ? "loaded" : undefined));
    expect(loadedBaseOnly).toEqual({ ok: false, problems: [{ family: "Roboto Serif", reason: "not_loaded", elementIds: ["t"] }] });
    expect(checkFontsReady(p, () => "loaded")).toEqual({ ok: true });
    expect(checkFontsReady(p, (f) => (f.includes("@wdth") ? "loading" : "loaded"))).toMatchObject({ ok: false, problems: [{ reason: "loading" }] });
  });
  it("una anchura en una fuente del catálogo es una cara inexistente", () => {
    const p: Project = { ...baseProject(), elements: [textEl("t", { runs: [{ ...big, stretch: 75 }] })] };
    const r = checkFontsReady(p, () => "loaded");
    expect(r).toMatchObject({ ok: false, problems: [{ family: "Lora", reason: "face_missing", stretches: [75] }] });
  });
});

describe("renderDocument: máscara, filtros y opacidad", () => {
  const p = (): Project => ({
    ...baseProject(),
    assets: [
      { id: "a1", kind: "image", mimeType: "image/png", metadata: { widthPx: 600, heightPx: 900 } },
      { id: "m1", kind: "image", mimeType: "image/png", metadata: { widthPx: 300, heightPx: 300 } },
    ],
    canvas: { ...baseProject().canvas, background: { assetId: "a1" }, backgroundFilters: { blur: 0, brightness: 100, saturation: 100 } },
    elements: [
      textEl("t", { opacity: 0.5, mask: { assetId: "m1", fit: "tile", tileIn: 1, mode: "dark", threshold: 0.3 } }),
      imageEl("i", "a1", { zIndex: 1, filters: { blur: 10 } }),
      shapeEl("s", { zIndex: 2 }),
    ],
  });
  it("coloca la máscara como una textura en mosaico, con su modo y umbral", () => {
    const r = renderDocument(p(), { pxPerInch: 300 });
    const t = r.items.find((i) => i.id === "t");
    if (t?.kind !== "text") throw new Error("texto");
    expect(t.mask).toMatchObject({ assetId: "m1", repeat: true, mode: "dark", threshold: 0.3, softness: 0.1, dest: { width: 300, height: 300 } });
    expect(t.opacity).toBe(0.5);
  });
  it("filtros neutros son null; los demás se conservan; la opacidad por defecto es 1", () => {
    const r = renderDocument(p(), { pxPerInch: 300 });
    expect(r.background.kind === "image" && r.background.filters).toBeNull();
    const i = r.items.find((x) => x.id === "i");
    expect(i?.kind === "image" && i.filters).toEqual({ blur: 10 });
    expect(r.items.find((x) => x.id === "s")?.opacity).toBe(1);
  });
});
