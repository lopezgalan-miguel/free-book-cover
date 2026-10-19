import { describe, expect, it } from "vitest";
import { paintTextItem, type TextItem } from "../src/canvas/paintText";
import { recordingContext } from "./helpers/recordingContext";

const style = { font: "400 40px Lora", fontPx: 40, color: "#ffffff", underline: false, spacingPx: 0 };
const item = (shadow: TextItem["effects"]["shadow"]): TextItem => ({
  id: "t", zIndex: 0, kind: "text", rotation: 0, opacity: 1, box: { x: 0, y: 0, width: 300, height: 100 },
  element: {
    id: "t", type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 10, weight: 400, italic: false, underline: false, uppercase: false, color: "#ffffff" }],
    align: "left", lineHeight: 1, letterSpacing: 0, shadow: { on: shadow !== null, intensity: 40 }, outline: { on: false, width: 0, color: "#000000" }, curvature: 0,
  },
  layout: { heightPx: 40, glyphs: null, lines: [{ top: 0, height: 40, baseline: 32, width: 80, pieces: [{ text: "Hola", x: 0, width: 80, style }] }] },
  effects: { shadow, outline: null, innerShadow: null },
  texture: null,
  mask: null,
});
const shadow = { dx: 0, dy: 5, blur: 6.4, color: "rgba(0,0,0,0.6)" };
const withScale = (k: number) => {
  const r = recordingContext();
  (r.ctx as unknown as { getTransform: () => object }).getTransform = () => ({ a: k, b: 0, c: 0, d: k, e: 0, f: 0 });
  return r;
};

describe("paintTextItem: efectos", () => {
  it("sin máscara, sombra interior ni opacidad no usa capa (sin drawImage)", () => {
    const { ctx, calls } = withScale(1);
    paintTextItem(ctx, item(shadow), new Map());
    expect(calls.some(([k]) => k === "drawImage")).toBe(false);
    expect(calls).toContainEqual(["fillText", "Hola", 0, 0]);
  });
  it("la sombra se expresa en px de dispositivo: con escala 2 el desplazamiento y el desenfoque se duplican", () => {
    const one = withScale(1);
    paintTextItem(one.ctx, item(shadow), new Map());
    const two = withScale(2);
    paintTextItem(two.ctx, item(shadow), new Map());
    const last = (calls: Array<[string, ...unknown[]]>, k: string) => calls.filter(([n, v]) => n === `set:${k}` && v !== 0).map(([, v]) => v)[0];
    expect(last(one.calls, "shadowOffsetY")).toBe(5);
    expect(last(two.calls, "shadowOffsetY")).toBe(10);
    expect(last(two.calls, "shadowBlur")).toBeCloseTo(12.8, 9);
  });
});
