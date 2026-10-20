import { afterEach, describe, expect, it, vi } from "vitest";
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
  layout: { heightPx: 40, minWidthPx: 80, glyphs: null, lines: [{ top: 0, height: 40, baseline: 32, width: 80, pieces: [{ text: "Hola", x: 0, width: 80, style }] }] },
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

  describe("orden en la capa", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("con máscara y sombra interior, la sombra (source-atop) se aplica antes que la máscara (destination-in)", () => {
      // Vitest corre en node: se sustituyen el lienzo auxiliar y la matriz para que la capa grabe sus llamadas.
      const { ctx, calls } = withScale(1);
      const rec = ctx as unknown as Record<string, unknown>;
      rec.canvas = { width: 1000, height: 1000 };
      rec.createPattern = () => ({ setTransform: () => undefined });
      rec.getImageData = () => ({ data: new Uint8ClampedArray(4) });
      vi.stubGlobal("OffscreenCanvas", class { getContext() { return ctx; } });
      vi.stubGlobal("DOMMatrix", class { translate() { return this; } scale() { return this; } });
      const it0 = item(null);
      it0.effects.innerShadow = { dx: 0, dy: 4, blur: 6, color: "rgba(0,0,0,1)" } as never;
      it0.mask = { assetId: "m", mode: "dark", threshold: 0.5, softness: 0, fit: "cover", repeat: false, src: { x: 0, y: 0, width: 1, height: 1 }, dest: { x: 0, y: 0, width: 300, height: 100 } } as never;
      const sources = new Map([["m", { image: {}, scale: 1 }]]) as never;
      paintTextItem(ctx, it0, sources);
      const ops = calls.filter(([k]) => k === "set:globalCompositeOperation").map(([, v]) => v);
      expect(ops).toContain("source-atop");
      expect(ops).toContain("destination-in");
      expect(ops.indexOf("source-atop")).toBeLessThan(ops.indexOf("destination-in"));
    });
  });
});
