import { describe, expect, it } from "vitest";
import { applyPixelFilters, blurRadiusPx, filterCss } from "../src/canvas/imageFilters";

const img = (w: number, h: number, fill: [number, number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) d.set(fill, i);
  return d;
};

describe("filtros de imagen", () => {
  it("filterCss omite los neutros y usa el radio en px", () => {
    expect(filterCss({ blur: 10, brightness: 60 }, 4)).toBe("blur(4px) brightness(60%)");
    expect(filterCss({ saturation: 120 }, 0)).toBe("saturate(120%)");
    expect(filterCss({ blur: 0, brightness: 100, saturation: 100 }, 0)).toBe("none");
  });
  it("el radio es blur/100 · 5 % del lado mayor de lo pintado", () => {
    expect(blurRadiusPx({ blur: 100 }, 1000, 2000)).toBeCloseTo(100, 9);
    expect(blurRadiusPx({ blur: 10 }, 1000, 500)).toBeCloseTo(5, 9);
    expect(blurRadiusPx({}, 1000, 500)).toBe(0);
  });
  it("brillo al 50 % reduce cada canal a la mitad", () => {
    const d = img(1, 1, [200, 100, 50, 255]);
    applyPixelFilters(d, 1, 1, { brightness: 50 }, 0);
    expect([...d]).toEqual([100, 50, 25, 255]);
  });
  it("saturación 0 deja el gris de la luminancia", () => {
    const d = img(1, 1, [200, 100, 50, 255]);
    applyPixelFilters(d, 1, 1, { saturation: 0 }, 0);
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
    expect(Math.abs(d[0]! - 118)).toBeLessThanOrEqual(1);
  });
  it("el desenfoque reparte un punto blanco y conserva la energía", () => {
    const w = 41;
    const d = img(w, w, [0, 0, 0, 255]);
    d.set([255, 255, 255, 255], (20 * w + 20) * 4);
    applyPixelFilters(d, w, w, { blur: 50 }, 3);
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i]!;
    expect(d[(20 * w + 20) * 4]).toBeLessThan(255);
    expect(d[(20 * w + 22) * 4]).toBeGreaterThan(0);
    expect(Math.abs(sum - 255) / 255).toBeLessThan(0.15);
  });
});
