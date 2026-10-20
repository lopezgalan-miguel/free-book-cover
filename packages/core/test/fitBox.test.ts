import { describe, expect, it } from "vitest";
import { FIT_TOLERANCE_IN, anchorX, fitTextBox, type TextElement, type TextMeasure, type TextRun } from "../src/index.js";
import { textEl } from "./fixtures.js";

// A 300 ppp, 72 pt = 300 px y cada carácter mide 0,5 in.
const measure: TextMeasure = (text, css) => text.length * Number(/([\d.]+)px/.exec(css)![1]) * 0.5;
const run = (text: string): TextRun => ({ text, fontFamily: "Lora", fontSizePt: 72, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" });
const el = (over: Partial<TextElement> = {}) => textEl("t", { x: 2, width: 1, height: 3, letterSpacing: 0, lineHeight: 1, align: "center", runs: [run("abcdef")], ...over });

describe("fitTextBox", () => {
  it("crece hasta la palabra más larga manteniendo el centro y ajusta el alto", () => {
    expect(fitTextBox(el(), measure)).toEqual({ x: 1, width: 3, height: 1 });
  });
  it("mantiene el borde de la alineación", () => {
    expect(fitTextBox(el({ align: "left" }), measure)).toEqual({ x: 2, width: 3, height: 1 });
    expect(fitTextBox(el({ align: "right" }), measure)).toEqual({ x: 0, width: 3, height: 1 });
  });
  it("con ancho suficiente solo corrige el alto", () => {
    const r = fitTextBox(el({ x: 1, width: 5, height: 3, runs: [run("hola mundo")] }), measure);
    expect(r).toEqual({ x: 1, width: 5, height: 1 });
  });
  it("una caja ya ajustada devuelve null", () => {
    expect(fitTextBox(el({ width: 5, height: 1, runs: [run("hola mundo")] }), measure)).toBeNull();
    expect(FIT_TOLERANCE_IN).toBe(0.001);
  });
  it("en texto curvo no cambia el ancho", () => {
    const r = fitTextBox(el({ curvature: 50, width: 1, height: 3 }), measure);
    expect(r).not.toBeNull();
    expect(r!.width).toBe(1);
    expect(r!.x).toBe(2);
  });
});

describe("anchorX", () => {
  it("fija el borde de la alineación", () => {
    const b = { x: 4, width: 2 };
    expect(anchorX({ ...b, align: "left" }, 6)).toBe(4);
    expect(anchorX({ ...b, align: "right" }, 6)).toBe(0);
    expect(anchorX({ ...b, align: "center" }, 6)).toBe(2);
    expect(anchorX({ ...b, align: "justify" }, 6)).toBe(2);
  });
});
