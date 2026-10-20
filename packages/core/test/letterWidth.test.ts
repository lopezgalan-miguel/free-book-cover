import { describe, expect, it } from "vitest";
import { anchorX } from "../src/index.js";

const box = { x: 1, width: 4, align: "center" as const };

describe("anchorX", () => {
  it("centrado o justificado conserva el centro", () => {
    expect(anchorX(box, 5)).toBe(0.5);
    expect(anchorX({ ...box, align: "justify" }, 2)).toBe(2);
  });
  it("a la izquierda fija el borde izquierdo; a la derecha, el derecho", () => {
    expect(anchorX({ ...box, align: "left" }, 6)).toBe(1);
    expect(anchorX({ ...box, align: "right" }, 6)).toBe(-1);
  });
});
