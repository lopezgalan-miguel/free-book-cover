import { describe, expect, it } from "vitest";
import { applyStyleToRange, readFontAxes, replaceText, type TextRun } from "../src/index.js";

// sfnt mínimo con una sola tabla fvar y los ejes dados (Fixed 16.16).
function sfnt(axes: Array<[string, number, number, number]>, version = [0, 1, 0, 0]): Uint8Array {
  const axisSize = 20;
  const fvarLen = 16 + axes.length * axisSize;
  const buf = new Uint8Array(12 + 16 + fvarLen);
  const dv = new DataView(buf.buffer);
  buf.set(version, 0);
  dv.setUint16(4, 1);
  buf.set([..."fvar"].map((c) => c.charCodeAt(0)), 12);
  dv.setUint32(20, 28);
  dv.setUint32(24, fvarLen);
  const f = 28;
  dv.setUint16(f, 1);
  dv.setUint16(f + 4, 16);
  dv.setUint16(f + 8, axes.length);
  dv.setUint16(f + 10, axisSize);
  axes.forEach(([tag, min, def, max], i) => {
    const o = f + 16 + i * axisSize;
    buf.set([...tag].map((c) => c.charCodeAt(0)), o);
    dv.setInt32(o + 4, Math.round(min * 65536));
    dv.setInt32(o + 8, Math.round(def * 65536));
    dv.setInt32(o + 12, Math.round(max * 65536));
  });
  return buf;
}

describe("readFontAxes", () => {
  it("lee los ejes de la tabla fvar", () => {
    expect(readFontAxes(sfnt([["wght", 100, 400, 900], ["wdth", 50, 100, 150]]))).toEqual([
      { tag: "wght", min: 100, def: 400, max: 900 },
      { tag: "wdth", min: 50, def: 100, max: 150 },
    ]);
    expect(readFontAxes(sfnt([["opsz", 8, 14, 144]], [0x4f, 0x54, 0x54, 0x4f]))).toEqual([{ tag: "opsz", min: 8, def: 14, max: 144 }]);
  });
  it("null sin fvar, con WOFF2 o con datos truncados", () => {
    const noFvar = sfnt([]);
    noFvar.set([..."glyf"].map((c) => c.charCodeAt(0)), 12);
    expect(readFontAxes(noFvar)).toBeNull();
    expect(readFontAxes(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]))).toBeNull();
    expect(readFontAxes(sfnt([["wght", 100, 400, 900]]).slice(0, 40))).toBeNull();
  });
});

describe("fragmentos con anchura de fuente", () => {
  const run = (text: string, stretch?: number): TextRun => ({
    text, fontFamily: "RS", fontSizePt: 20, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff", ...(stretch !== undefined ? { stretch } : {}),
  });
  it("lo que se escribe hereda la anchura y no se funden fragmentos de anchura distinta", () => {
    const r = replaceText([run("AB", 60)], "ABC");
    expect(r).toEqual([run("ABC", 60)]);
    const styled = applyStyleToRange([run("ABCD")], 0, 2, { stretch: 70 });
    expect(styled.map((x) => [x.text, x.stretch])).toEqual([["AB", 70], ["CD", undefined]]);
  });
});
