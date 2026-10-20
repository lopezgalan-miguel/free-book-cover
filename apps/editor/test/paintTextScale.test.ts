import { describe, expect, it } from "vitest";
import { paintTextItem, type TextItem } from "../src/canvas/paintText";
import { recordingContext } from "./helpers/recordingContext";

const style = { font: "400 40px Lora", fontPx: 40, color: "#ffffff", underline: true, spacingPx: 4 };
const item = (scaleX?: number): TextItem => ({
  id: "t", zIndex: 0, kind: "text", rotation: 0, opacity: 1, box: { x: 0, y: 0, width: 300, height: 100 },
  element: {
    id: "t", type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 10, weight: 400, italic: false, underline: true, uppercase: false, color: "#ffffff" }],
    align: "left", lineHeight: 1, letterSpacing: 0.1, shadow: { on: false, intensity: 0 }, outline: { on: false, width: 0, color: "#000000" }, curvature: 0,
    ...(scaleX !== undefined ? { scaleX } : {}),
  },
  // La maquetación ya viene estrechada: 4 letras de 10 px + 4 × 4 px de espaciado.
  layout: { heightPx: 40, minWidthPx: 80, glyphs: null, lines: [{ top: 0, height: 40, baseline: 32, width: 56, pieces: [{ text: "Hola", x: 10, width: 56, style }] }] },
  effects: { shadow: null, outline: null, innerShadow: null, bevel: null },
  texture: null,
  mask: null,
});

describe("paintTextItem: anchura de las letras", () => {
  it("estrecha el dibujo con una escala horizontal y compensa espaciado y subrayado", () => {
    const { ctx, calls } = recordingContext();
    paintTextItem(ctx, item(0.5), new Map());
    expect(calls).toContainEqual(["translate", 10, 32]);
    expect(calls).toContainEqual(["scale", 0.5, 1]);
    // El espaciado se aplica en el espacio escalado: 4 px reales son 8 px antes de escalar.
    expect(calls).toContainEqual(["set:letterSpacing", "8px"]);
    expect(calls).toContainEqual(["fillText", "Hola", 0, 0]);
    // El subrayado cubre la anchura maquetada: 56 px reales.
    expect(calls.find((c) => c[0] === "fillRect")).toEqual(["fillRect", 0, 40 * 0.12, 112, 2]);
  });
  it("sin anchura no escala", () => {
    const { ctx, calls } = recordingContext();
    paintTextItem(ctx, item(), new Map());
    expect(calls.some((c) => c[0] === "scale")).toBe(false);
    expect(calls).toContainEqual(["set:letterSpacing", "4px"]);
  });
});
