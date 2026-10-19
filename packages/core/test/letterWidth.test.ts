import { describe, expect, it } from "vitest";
import { letterWidthPatch } from "../src/index.js";

const box = { x: 1, width: 4, align: "center" as const };

describe("letterWidthPatch", () => {
  it("la caja crece con las letras y conserva el centro", () => {
    const p = letterWidthPatch({ ...box, scaleX: 1 }, 1.25);
    expect(p).toEqual({ scaleX: 1.25, width: 5, x: 0.5 });
  });
  it("parte de la anchura que ya tenía (sin scaleX cuenta como 1) y también encoge", () => {
    expect(letterWidthPatch(box, 0.5)).toEqual({ scaleX: 0.5, width: 2, x: 2 });
    const p = letterWidthPatch({ ...box, scaleX: 0.8 }, 1.2);
    expect(p.width).toBeCloseTo(6);
    expect(p.x).toBeCloseTo(0);
  });
  it("alineado a la izquierda fija el borde izquierdo; a la derecha, el derecho", () => {
    expect(letterWidthPatch({ ...box, align: "left" }, 1.5)).toEqual({ scaleX: 1.5, width: 6, x: 1 });
    expect(letterWidthPatch({ ...box, align: "right" }, 1.5)).toEqual({ scaleX: 1.5, width: 6, x: -1 });
  });
});
