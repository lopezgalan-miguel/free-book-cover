import { describe, expect, it } from "vitest";
import { fitFontToWidth, layoutText, type TextElement, type TextMeasure, type TextRun } from "../src/index.js";
import { textEl } from "./fixtures.js";

// A 300 ppp, 72 pt = 300 px y cada carácter mide 0,5 in.
const measure: TextMeasure = (text, css) => text.length * Number(/([\d.]+)px/.exec(css)![1]) * 0.5;
const run = (text: string, fontSizePt = 72): TextRun => ({ text, fontFamily: "Lora", fontSizePt, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" });
const el = (over: Partial<TextElement> = {}) => textEl("t", { width: 4, height: 3, letterSpacing: 0, lineHeight: 1, align: "left", curvature: 0, runs: [run("abcd")], ...over });
const sizes = (r: TextRun[] | null) => r!.map((x) => x.fontSizePt);

describe("fitFontToWidth", () => {
  it("escala el cuerpo para que la línea llene la caja", () => {
    expect(sizes(fitFontToWidth(el(), measure))).toEqual([144]);
  });
  it("manda la línea más ancha de las escritas", () => {
    expect(sizes(fitFontToWidth(el({ runs: [run("ab\nabcdef")] }), measure))).toEqual([96]);
  });
  it("no parte líneas por el ancho de la caja", () => {
    expect(sizes(fitFontToWidth(el({ width: 1, runs: [run("ab cd")] }), measure))).toEqual([Math.round((72 * 1) / 2.5 * 10) / 10]);
  });
  it("conserva la relación entre fragmentos", () => {
    expect(sizes(fitFontToWidth(el({ runs: [run("ab", 72), run("cd", 36)] }), measure))).toEqual([192, 96]);
  });
  it("acota a 300 pt el fragmento mayor y conserva la proporción", () => {
    expect(sizes(fitFontToWidth(el({ width: 40, runs: [run("ab", 72), run("cd", 36)] }), measure))).toEqual([300, 150]);
  });
  it("texto curvo, sin texto o ya ajustado devuelven null", () => {
    expect(fitFontToWidth(el({ curvature: 30 }), measure)).toBeNull();
    expect(fitFontToWidth(el({ runs: [run("")] }), measure)).toBeNull();
    expect(fitFontToWidth(el({ width: 2 }), measure)).toBeNull();
  });
  it("redondea hacia abajo: el ideal (~63,57 pt) no es múltiplo de 0,1: la línea cabe y no se parte", () => {
    const odd: TextMeasure = (text, css) => text.length * Number(/([\d.]+)px/.exec(css)![1]) * 0.5034;
    const e = el({ runs: [run("abcd efgh")] });
    const runs = fitFontToWidth(e, odd)!;
    const out = layoutText({ ...e, runs }, 300, odd);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]!.width / 300).toBeLessThanOrEqual(4);
  });
  it("un fragmento vacío diminuto no limita el factor", () => {
    expect(sizes(fitFontToWidth(el({ runs: [run("abcd", 72), run("", 6)] }), measure))).toEqual([144, 12]);
  });
  it("en el límite: a 300 pt que ya no pueden crecer, o a 6 pt que no pueden encoger, no devuelve nada", () => {
    expect(fitFontToWidth(el({ width: 40, runs: [run("ab", 300)] }), measure)).toBeNull();
    expect(fitFontToWidth(el({ width: 0.01, runs: [run("abcd", 6)] }), measure)).toBeNull();
  });
  it("si un fragmento ya está en 6 pt no se encoge el bloque: las proporciones mandan sobre llenar la caja", () => {
    expect(fitFontToWidth(el({ width: 0.05, runs: [run("ab", 72), run("cd", 6)] }), measure)).toBeNull();
  });
});
