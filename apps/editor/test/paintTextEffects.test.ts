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
  effects: { shadow, outline: null, innerShadow: null, bevel: null },
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

  describe("bisel", () => {
    afterEach(() => vi.unstubAllGlobals());
    const light = { dx: 0, dy: 5, blur: 2, color: "rgba(255,255,255,0.6)" };
    const dark = { dx: 0, dy: -5, blur: 2, color: "rgba(0,0,0,0.5)" };
    // Cada OffscreenCanvas creado queda registrado (en orden) para distinguir capa, silueta y lienzos auxiliares.
    const made: object[] = [];
    const layered = () => {
      made.length = 0;
      const r = withScale(1);
      const rec = r.ctx as unknown as Record<string, unknown>;
      rec.canvas = { width: 1000, height: 1000 };
      rec.createPattern = () => ({ setTransform: () => undefined });
      rec.getImageData = () => ({ data: new Uint8ClampedArray(4) });
      vi.stubGlobal("OffscreenCanvas", class { constructor() { made.push(this); } getContext() { return r.ctx; } });
      vi.stubGlobal("DOMMatrix", class { translate() { return this; } scale() { return this; } });
      return r;
    };
    const maskOf = () => ({ assetId: "m", mode: "dark", threshold: 0.5, softness: 0, fit: "cover", repeat: false, src: { x: 0, y: 0, width: 1, height: 1 }, dest: { x: 0, y: 0, width: 300, height: 100 } }) as never;
    const colors = (calls: Array<[string, ...unknown[]]>) => calls.filter(([k]) => k === "set:shadowColor").map(([, v]) => v);
    it("con bisel hay capa y dos pasadas de sombra interior: primero la luz y luego la sombra", () => {
      const { ctx, calls } = layered();
      const it0 = item(null);
      it0.effects.bevel = { light, dark };
      paintTextItem(ctx, it0, new Map());
      expect(calls.some(([k]) => k === "drawImage")).toBe(true);
      expect(calls.filter(([k, v]) => k === "set:globalCompositeOperation" && v === "source-atop").length).toBe(2);
      const c = colors(calls);
      expect(c.indexOf(light.color)).toBeGreaterThanOrEqual(0);
      expect(c.indexOf(light.color)).toBeLessThan(c.indexOf(dark.color));
    });
    it("con máscara o textura con huecos, sombra interior y las dos pasadas del bisel usan la misma silueta opaca, no la capa", () => {
      const { ctx, calls } = layered();
      const it0 = item(null);
      it0.effects.innerShadow = { dx: 0, dy: 4, blur: 6, color: "rgba(1,2,3,1)" } as never;
      it0.effects.bevel = { light, dark };
      it0.mask = maskOf();
      paintTextItem(ctx, it0, new Map([["m", { image: {}, scale: 1 }]]) as never);
      // El drawImage que sigue a cada destination-out recorta el negativo con la forma de la letra.
      const shapes = calls.flatMap((c, i) => (c[0] === "set:globalCompositeOperation" && c[1] === "destination-out" && calls[i + 1]?.[0] === "drawImage" ? [calls[i + 1]![1]] : []));
      expect(shapes.length).toBe(3);
      expect(new Set(shapes).size).toBe(1);
      const silhouette = shapes[0] as object;
      expect(made).toContain(silhouette);
      // made[0] es la capa principal.
      expect(silhouette).not.toBe(made[0]);
      expect(made.indexOf(silhouette)).toBe(1);
    });
    it("el orden es sombra interior, bisel y después máscara", () => {
      const { ctx, calls } = layered();
      const it0 = item(null);
      it0.effects.innerShadow = { dx: 0, dy: 4, blur: 6, color: "rgba(1,2,3,1)" } as never;
      it0.effects.bevel = { light, dark };
      it0.mask = maskOf();
      paintTextItem(ctx, it0, new Map([["m", { image: {}, scale: 1 }]]) as never);
      const c = colors(calls);
      const [i, l, d] = ["rgba(1,2,3,1)", light.color, dark.color].map((v) => c.indexOf(v));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(l!);
      expect(l).toBeLessThan(d!);
      const lastAtop = calls.map(([k, v]) => k === "set:globalCompositeOperation" && v === "source-atop").lastIndexOf(true);
      const mask = calls.findIndex(([k, v]) => k === "set:globalCompositeOperation" && v === "destination-in");
      expect(lastAtop).toBeLessThan(mask);
    });
  });

  describe("expansión de la sombra", () => {
    afterEach(() => vi.unstubAllGlobals());
    const layered = (k = 1) => {
      const r = withScale(k);
      const rec = r.ctx as unknown as Record<string, unknown>;
      rec.canvas = { width: 1000, height: 1000 };
      rec.createPattern = () => ({ setTransform: () => undefined });
      rec.getImageData = () => ({ data: new Uint8ClampedArray(4) });
      vi.stubGlobal("OffscreenCanvas", class { getContext() { return r.ctx; } });
      vi.stubGlobal("DOMMatrix", class { translate() { return this; } scale() { return this; } });
      return r;
    };
    const glow = { ...shadow, spread: 8 };
    it("traza la silueta con 2 x spread antes del relleno de las letras, que no llevan sombra", () => {
      const { ctx, calls } = layered();
      paintTextItem(ctx, item(glow), new Map());
      const stroke = calls.findIndex(([k]) => k === "strokeText");
      expect(stroke).toBeGreaterThanOrEqual(0);
      const lw = calls.slice(0, stroke).filter(([k]) => k === "set:lineWidth").map(([, v]) => v);
      expect(lw[lw.length - 1]).toBe(16);
      expect(calls.some(([k, v]) => k === "set:lineJoin" && v === "round")).toBe(true);
      const fills = calls.map((c, i) => [c, i] as const).filter(([c]) => c[0] === "fillText").map(([, i]) => i);
      const lastFill = fills[fills.length - 1]!;
      expect(fills.some((i) => i > stroke)).toBe(true);
      // La sombra se fija una sola vez (volcado de la expansión) y el relleno final no la lleva.
      const shadowSets = calls.map((c, i) => [c, i] as const).filter(([c]) => c[0] === "set:shadowColor" && c[1] === "rgba(0,0,0,0.6)").map(([, i]) => i);
      expect(shadowSets.length).toBe(1);
      expect(shadowSets[0]!).toBeLessThan(lastFill);
      const drawAt = calls.map((c, i) => [c, i] as const).filter(([c]) => c[0] === "drawImage").map(([, i]) => i);
      const lastDraw = drawAt[drawAt.length - 1]!;
      const colorAfter = calls.slice(shadowSets[0]! + 1, lastDraw).filter(([k]) => k === "set:shadowColor").map(([, v]) => v);
      expect(colorAfter.every((v) => v !== "rgba(0,0,0,0.6)")).toBe(true);
    });
    it("con máscara, la silueta de la expansión no se recorta", () => {
      const { ctx, calls } = layered();
      const it0 = item(glow);
      it0.mask = { assetId: "m", mode: "dark", threshold: 0.5, softness: 0, fit: "cover", repeat: false, src: { x: 0, y: 0, width: 1, height: 1 }, dest: { x: 0, y: 0, width: 300, height: 100 } } as never;
      paintTextItem(ctx, it0, new Map([["m", { image: {}, scale: 1 }]]) as never);
      const stroke = calls.findIndex(([k]) => k === "strokeText");
      const mask = calls.findIndex(([k, v]) => k === "set:globalCompositeOperation" && v === "destination-in");
      expect(stroke).toBeGreaterThanOrEqual(0);
      expect(mask).toBeGreaterThan(stroke);
      expect(calls.slice(0, stroke).some(([k, v]) => k === "set:globalCompositeOperation" && v === "destination-in")).toBe(false);
    });
    it("sin soporte de capas no hay trazo de expansión", () => {
      const { ctx, calls } = recordingContext();
      paintTextItem(ctx, item(glow), new Map());
      expect(calls.some(([k]) => k === "strokeText")).toBe(false);
      expect(calls.some(([k]) => k === "drawImage")).toBe(false);
    });
  });
});
