import { describe, expect, it } from "vitest";
import { defaultTextElement, elementSchema } from "../src/index.js";

const canvas = { widthIn: 6, heightIn: 9 };

describe("defaultTextElement", () => {
  it("centra una caja de medio lienzo al 65 % de alto con el estilo por defecto, y es válido", () => {
    const t = defaultTextElement({ id: "t1", text: "Hola", canvas });
    expect(t).toMatchObject({ x: 1.5, width: 3, height: 1, align: "center", lineHeight: 1.2, letterSpacing: 0.02 });
    expect(t.y).toBeCloseTo(5.85); // 9 × 0,65 no es exacto en coma flotante
    expect(t.runs[0]).toEqual({ text: "Hola", fontFamily: "Lora", fontSizePt: 36, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" });
    expect(elementSchema.safeParse(t).success).toBe(true);
  });

  it("respeta posición, ancho y estilo dados (undefined = por defecto)", () => {
    const t = defaultTextElement({ id: "t2", text: "X", canvas, x: 0.5, y: undefined, width: 2, style: { color: "#000000", align: "left", fontSizePt: undefined } });
    expect(t).toMatchObject({ x: 0.5, width: 2, align: "left" });
    expect(t.y).toBeCloseTo(5.85);
    expect(t.runs[0]).toMatchObject({ color: "#000000", fontSizePt: 36 });
  });
});
