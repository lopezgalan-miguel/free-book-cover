import { describe, expect, it } from "vitest";
import { TEXT_STYLE_KEYS, editableKeys, elementStyleSchema, needsRelayout, styleToPatch, type TextElement } from "../src/index.js";

const text: TextElement = {
  id: "t", type: "text", x: 0, y: 0, width: 2, height: 1, rotation: 0, zIndex: 0, visible: true,
  runs: [{ text: "A", fontFamily: "Lora", fontSizePt: 36, weight: 500, italic: false, underline: false, uppercase: false, color: "#000000" }],
  align: "center", lineHeight: 1.2, letterSpacing: 0, shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#000000" }, curvature: 0,
};

describe("editableKeys", () => {
  it("cada tipo admite la geometría y sus propiedades propias, y no las de otros tipos", () => {
    expect([...editableKeys("shape")]).toEqual(expect.arrayContaining(["x", "visible", "fill", "stroke"]));
    expect(editableKeys("shape").has("fontFamily")).toBe(false);
    expect(editableKeys("image").has("fit")).toBe(true);
    expect(editableKeys("text").has("fill")).toBe(false);
  });

  it("el protocolo MCP y las reglas no se desincronizan", () => {
    for (const k of TEXT_STYLE_KEYS) expect(editableKeys("text").has(k)).toBe(true);
    const all = new Set([...editableKeys("text"), ...editableKeys("image"), ...editableKeys("shape")]);
    for (const k of Object.keys(elementStyleSchema.shape)) expect(all.has(k)).toBe(true);
  });
});

describe("styleToPatch", () => {
  it("en texto, las propiedades de tramo se aplican a todos los tramos", () => {
    const p = styleToPatch(text, { color: "#ff0000", align: "left", fontSizePt: undefined });
    expect(p).toEqual({ align: "left", runs: [{ ...text.runs[0], color: "#ff0000" }] });
  });

  it("en otros tipos, copia lo definido tal cual", () => {
    const shape = { ...text, type: "shape", shape: "rect", fill: "#000000" } as never;
    expect(styleToPatch(shape, { fill: "#ffffff", x: undefined })).toEqual({ fill: "#ffffff" });
  });

  it("needsRelayout: solo los cambios que alteran la maquetación", () => {
    expect(needsRelayout({ color: "#000000" })).toBe(false);
    expect(needsRelayout({ fontSizePt: 40 })).toBe(true);
    expect(needsRelayout({ width: 3 })).toBe(true);
  });
});
