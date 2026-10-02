import { describe, expect, it } from "vitest";
import { LIMITS, checkAssetLimits } from "../src/index.js";

const MB = 1024 * 1024;
describe("límites de recursos (SDD §6)", () => {
  it("imagen: peso en el límite pasa, un byte más no", () => {
    expect(checkAssetLimits({ kind: "image", sizeBytes: 100 * MB }, 0)).toEqual({ ok: true });
    expect(checkAssetLimits({ kind: "image", sizeBytes: 100 * MB + 1 }, 0)).toEqual({ ok: false, error: { kind: "image_too_large", limitBytes: LIMITS.imageBytes } });
  });
  it("imagen: 80 Mpx pasa, 80,000001 no; sin dimensiones solo se mira el peso", () => {
    expect(checkAssetLimits({ kind: "image", sizeBytes: 1, widthPx: 8000, heightPx: 10000 }, 0).ok).toBe(true);
    const r = checkAssetLimits({ kind: "image", sizeBytes: 1, widthPx: 8000, heightPx: 10001 }, 0);
    expect(r).toMatchObject({ ok: false, error: { kind: "image_too_many_megapixels" } });
    expect(checkAssetLimits({ kind: "image", sizeBytes: 1 }, 0).ok).toBe(true);
  });
  it("fuente: 20 MB", () => {
    expect(checkAssetLimits({ kind: "font", sizeBytes: 20 * MB }, 0).ok).toBe(true);
    expect(checkAssetLimits({ kind: "font", sizeBytes: 20 * MB + 1 }, 0)).toMatchObject({ ok: false, error: { kind: "font_too_large" } });
  });
  it("proyecto: aviso a 400 MB y rechazo sobre 500 MB", () => {
    expect(checkAssetLimits({ kind: "font", sizeBytes: 1 * MB }, 398 * MB)).toEqual({ ok: true });
    expect(checkAssetLimits({ kind: "font", sizeBytes: 1 * MB }, 399 * MB)).toEqual({ ok: true, warning: "project_near_limit" });
    expect(checkAssetLimits({ kind: "font", sizeBytes: 1 * MB }, 499 * MB)).toEqual({ ok: true, warning: "project_near_limit" });
    expect(checkAssetLimits({ kind: "font", sizeBytes: 1 * MB + 1 }, 499 * MB)).toMatchObject({ ok: false, error: { kind: "project_too_large" } });
  });
  it("tamaños inválidos", () => {
    for (const bad of [-1, NaN, Infinity]) expect(checkAssetLimits({ kind: "image", sizeBytes: bad }, 0)).toEqual({ ok: false, error: { kind: "invalid_size" } });
    expect(checkAssetLimits({ kind: "image", sizeBytes: 1 }, -5).ok).toBe(false);
    expect(checkAssetLimits({ kind: "image", sizeBytes: 1, widthPx: NaN, heightPx: 1 }, 0).ok).toBe(false);
  });
});
