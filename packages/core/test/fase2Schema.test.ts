import { describe, expect, it } from "vitest";
import { bevelSchema, customTarget, textElementSchema, editableKeys, needsRelayout, projectSchema, unusedAssetIds, variantDocument, type Project } from "../src/index.js";
import { baseProject, imageEl, shapeEl, textEl } from "./fixtures.js";

const run0 = { text: "Hola", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" };

function doc(): Project {
  const p = baseProject();
  p.assets = [
    { id: "a1", kind: "image", mimeType: "image/png", metadata: { widthPx: 600, heightPx: 900 } },
    { id: "m1", kind: "image", mimeType: "image/png", metadata: { widthPx: 256, heightPx: 256 } },
  ];
  p.canvas.background = { assetId: "a1" };
  p.canvas.backgroundFilters = { blur: 20, brightness: 60, saturation: 80 };
  p.elements = [
    textEl("t1", {
      opacity: 0.8,
      runs: [{ ...run0, stretch: 75 }],
      shadow: { on: true, intensity: 40, color: "#200000", opacity: 0.9, angle: 45, distance: 0.08 },
      innerShadow: { on: true, color: "#000000", opacity: 0.6, angle: 90, distance: 0.03, blur: 0.06 },
      texture: { assetId: "a1", fit: "tile", tileIn: 2 },
      mask: { assetId: "m1", fit: "tile", tileIn: 1, mode: "dark", threshold: 0.35, softness: 0.1 },
    }),
    imageEl("i1", "a1", { zIndex: 1, opacity: 0.5, filters: { blur: 10, brightness: 150, saturation: 0 } }),
    shapeEl("s1", { zIndex: 2, opacity: 0.25 }),
  ];
  return p;
}
const ok = (p: unknown) => projectSchema.safeParse(p).success;

describe("esquema de la fase 2", () => {
  it("bisel: uno válido pasa, depth 0,5 falla y sin bisel sigue validando", () => {
    const bevel = { on: true, depth: 0.025, angle: 90, soften: 0.02, highlight: "#ffffff", highlightOpacity: 0.6, shade: "#000000", shadeOpacity: 0.5 };
    expect(bevelSchema.safeParse(bevel).success).toBe(true);
    expect(bevelSchema.safeParse({ ...bevel, depth: 0.5 }).success).toBe(false);
    expect(textElementSchema.safeParse(textEl("t", { bevel })).success).toBe(true);
    expect(textElementSchema.safeParse(textEl("t", { bevel: { ...bevel, depth: 0.5 } })).success).toBe(false);
    expect(textElementSchema.safeParse(textEl("t")).success).toBe(true);
  });
  it("acepta opacidad, filtros, sombras configurables, máscara y anchura de fuente", () => {
    const r = projectSchema.safeParse(doc());
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });
  it("rechaza valores fuera de rango", () => {
    const p = doc();
    const t = p.elements[0]!;
    expect(ok({ ...p, elements: [{ ...t, opacity: 1.2 }] })).toBe(false);
    expect(ok({ ...p, elements: [{ ...t, mask: { assetId: "m1", mode: "x", threshold: 0.5 } }] })).toBe(false);
    expect(ok({ ...p, elements: [{ ...t, mask: { assetId: "m1", mode: "dark", threshold: 1.5 } }] })).toBe(false);
    expect(ok({ ...p, elements: [{ ...t, runs: [{ ...run0, stretch: 10 }] }] })).toBe(false);
    expect(ok({ ...p, elements: [{ ...t, runs: [{ ...run0, stretch: 201 }] }] })).toBe(false);
    expect(ok({ ...p, elements: [{ ...t, shadow: { on: true, intensity: 40, distance: 2 } }] })).toBe(false);
    expect(ok({ ...p, elements: [imageEl("i", "a1", { filters: { blur: 101 } })] })).toBe(false);
    expect(ok({ ...p, elements: [imageEl("i", "a1", { filters: { brightness: 201 } })] })).toBe(false);
    expect(ok({ ...p, canvas: { ...p.canvas, backgroundFilters: { contrast: 1 } } })).toBe(false);
  });
  it("una máscara que apunta a un recurso inexistente es inválida", () => {
    const p = doc();
    const t = p.elements[0]!;
    const r = projectSchema.safeParse({ ...p, elements: [{ ...t, mask: { assetId: "nope", mode: "alpha", threshold: 0.5 } }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("nope");
  });
  it("la máscara cuenta como uso de su recurso", () => {
    const p = doc();
    expect(unusedAssetIds(p)).toEqual([]);
  });
  it("las variantes escalan la tesela de la textura y de la máscara", () => {
    const p = doc();
    const half = customTarget("v", 900, 1350);
    if (!half.ok) throw new Error("variante");
    const v = variantDocument(p, half.target);
    const t = v.elements.find((e) => e.id === "t1");
    if (t?.type !== "text") throw new Error("texto");
    // 900 px / 300 ppp = 3 in sobre un base de 6 in: escala 0,5.
    expect(t.texture?.tileIn).toBeCloseTo(1, 9);
    expect(t.mask?.tileIn).toBeCloseTo(0.5, 9);
  });
  it("las propiedades nuevas son editables y la anchura de fuente recalcula la maquetación", () => {
    expect([...editableKeys("text")]).toEqual(expect.arrayContaining(["opacity", "innerShadow", "mask", "stretch"]));
    expect([...editableKeys("image")]).toEqual(expect.arrayContaining(["opacity", "filters"]));
    expect([...editableKeys("shape")]).toContain("opacity");
    expect(needsRelayout({ stretch: 80 })).toBe(true);
  });
});
