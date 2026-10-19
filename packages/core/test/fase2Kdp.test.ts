import { describe, expect, it } from "vitest";
import { SUPPORTED_TRIMS, kdpLayout, maxPagesFor, validatePrintSetup, type PrintSetup } from "../src/index.js";

const setup = (o: Partial<PrintSetup> = {}): PrintSetup => ({ trimWidthIn: 6, trimHeightIn: 9, pageCount: 100, paperAndInk: "bw-white", readingDirection: "ltr", ...o });

describe("cortes oficiales de tapa blanda (KDP, 2026-10-19)", () => {
  it("lista los 16 cortes de la tabla oficial", () => {
    expect(SUPPORTED_TRIMS.map((t) => `${t.widthIn}x${t.heightIn}`)).toEqual([
      "5x8", "5.06x7.81", "5.25x8", "5.5x8.5", "6x9", "6.14x9.21", "6.69x9.61", "7x10", "7.44x9.69", "7.5x9.25", "8x10",
      "8.25x6", "8.25x8.25", "8.27x11.69", "8.5x8.5", "8.5x11",
    ]);
  });
  it("5,5 × 8,5 en crema con 116 páginas es válido", () => {
    expect(validatePrintSetup(setup({ trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount: 116, paperAndInk: "bw-cream" }))).toEqual({ ok: true });
  });
  it("cada corte tiene su máximo por papel", () => {
    expect(maxPagesFor(6, 9, "bw-white")).toBe(828);
    expect(maxPagesFor(8.25, 8.25, "bw-cream")).toBe(750);
    expect(maxPagesFor(8.27, 11.69, "color-premium")).toBe(590);
    expect(maxPagesFor(8.5, 11, "color-standard")).toBe(600);
    expect(maxPagesFor(8.27, 11.69, "color-standard")).toBeNull();
    expect(validatePrintSetup(setup({ trimWidthIn: 8.5, trimHeightIn: 11, pageCount: 600 }))).toEqual({ ok: false, issues: [{ kind: "pages_above_max", max: 590 }] });
    expect(validatePrintSetup(setup({ trimWidthIn: 8.5, trimHeightIn: 11, pageCount: 590 }))).toEqual({ ok: true });
  });
  it("un papel que el corte no admite es un error propio", () => {
    expect(validatePrintSetup(setup({ trimWidthIn: 8.27, trimHeightIn: 11.69, pageCount: 100, paperAndInk: "color-standard" }))).toEqual({ ok: false, issues: [{ kind: "paper_unavailable_for_trim" }] });
  });
  it("un tamaño personalizado dentro del rango sigue sin admitirse", () => {
    expect(validatePrintSetup(setup({ trimWidthIn: 7, trimHeightIn: 9 }))).toMatchObject({ ok: false, issues: [{ kind: "trim_unsupported" }] });
  });
  it("el lomo de 5 × 8 con 134 páginas en crema coincide con la plantilla oficial (0,335 in)", () => {
    expect(kdpLayout(setup({ trimWidthIn: 5, trimHeightIn: 8, pageCount: 134, paperAndInk: "bw-cream" })).spineIn).toBeCloseTo(0.335, 6);
  });
});
