import { describe, expect, it } from "vitest";
import { maskAlpha } from "../src/canvas/mask";

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe("maskAlpha", () => {
  it("dark: lo oscuro por debajo del umbral se borra y lo claro se conserva", () => {
    const d = px(20, 20, 20, 255, 230, 230, 230, 255);
    maskAlpha(d, "dark", 0.5, 0);
    expect([d[3], d[7]]).toEqual([0, 255]);
  });
  it("light: al revés", () => {
    const d = px(20, 20, 20, 255, 230, 230, 230, 255);
    maskAlpha(d, "light", 0.5, 0);
    expect([d[3], d[7]]).toEqual([255, 0]);
  });
  it("alpha: usa la transparencia de la imagen con el mismo umbral", () => {
    const d = px(255, 255, 255, 100, 255, 255, 255, 200);
    maskAlpha(d, "alpha", 0.5, 0);
    expect([d[3], d[7]]).toEqual([0, 255]);
  });
  it("con suavizado hay una rampa entre el umbral y umbral + suavizado", () => {
    const d = px(128, 128, 128, 255);
    maskAlpha(d, "dark", 0.4, 0.2);
    expect(d[3]).toBeGreaterThan(0);
    expect(d[3]).toBeLessThan(255);
  });
  it("dark: un píxel transparente no conserva la letra", () => {
    const d = px(255, 255, 255, 0);
    maskAlpha(d, "dark", 0.5, 0);
    expect(d[3]).toBe(0);
  });
});
