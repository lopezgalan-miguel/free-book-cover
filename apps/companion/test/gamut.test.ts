import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { GAMUT_DELTA_E, gamutMap, srgbToLab } from "../src/preflight/gamut.js";
import { runPreflight, type PreflightSteps } from "../src/preflight/pipeline.js";
import { buildReport } from "../src/preflight/report.js";
import type { PdfInspection } from "../src/preflight/inspect.js";

const solid = (w: number, h: number, rgb: [number, number, number]) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();

describe("srgbToLab", () => {
  it("blanco, negro y rojo puro (D65)", () => {
    const [L, a, b] = srgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 1);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.5);
    expect(srgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 3);
    const red = srgbToLab(255, 0, 0);
    expect(red[0]).toBeCloseTo(53.24, 1);
    expect(red[1]).toBeCloseTo(80.09, 0);
  });
});

describe("gamutMap", () => {
  it("una imagen que no cambia al imprimir: 0 % y sin píxeles marcados", async () => {
    const g = await gamutMap(await solid(40, 30, [128, 128, 128]), await solid(20, 15, [128, 128, 128]));
    expect(g.percent).toBe(0);
    expect(g.maxDeltaE).toBeLessThan(1);
    const { data, info } = await sharp(g.png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([20, 15]);
    expect([data[0], data[1], data[2]]).not.toEqual([255, 0, 255]);
  });
  it("un rojo saturado que se apaga en CMYK: 100 % marcado en magenta, al tamaño de la prueba", async () => {
    const g = await gamutMap(await solid(40, 30, [255, 0, 0]), await solid(20, 15, [190, 40, 45]));
    expect(g.percent).toBe(100);
    expect(g.maxDeltaE).toBeGreaterThan(GAMUT_DELTA_E);
    const { data } = await sharp(g.png).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 255]);
  });
});

const good = (): PdfInspection => ({
  pageCount: 1, pageSizePt: { width: 864, height: 648 }, encrypted: false, structureOk: true, fileSizeBytes: 1000, fonts: [], transparency: [],
  images: [{ type: "image", color: "cmyk", ppiX: 300, ppiY: 300 }] as PdfInspection["images"],
});

describe("comprobación de gama en el informe", () => {
  const report = (gamutPercent: number | null) => buildReport({ inspection: good(), maxInkPercent: 250, expected: { widthIn: 12, heightIn: 9 }, encoding: "flate", gamutPercent });
  it("más del 1 % de píxeles fuera: aviso, que no impide «Listo para KDP»", () => {
    const r = report(4.26);
    expect(r.checks.find((c) => c.id === "gamut")).toEqual({ id: "gamut", status: "warn", params: { percent: 4.3, threshold: GAMUT_DELTA_E } });
    expect(r.ok).toBe(true);
  });
  it("hasta el 1 %: correcto; sin medida, no aparece", () => {
    expect(report(0.4).checks.find((c) => c.id === "gamut")?.status).toBe("pass");
    expect(report(null).checks.some((c) => c.id === "gamut")).toBe(false);
  });
});

describe("la cadena devuelve el mapa de gama", () => {
  it("con la prueba visual se mide la gama sobre la imagen aplanada", async () => {
    const steps: PreflightSteps = {
      flatten: vi.fn(async (b: Buffer) => b),
      toPdf: vi.fn(async () => ({ ppi: 300 })),
      inspect: vi.fn(async () => good()),
      measureInk: vi.fn(async () => 250),
      proof: vi.fn(async () => Buffer.from("proof")),
      gamut: vi.fn(async () => ({ percent: 12, maxDeltaE: 40, png: Buffer.from("map") })),
    };
    const r = await runPreflight({ image: Buffer.from("img"), widthIn: 12, heightIn: 9 }, steps);
    try {
      expect(steps.gamut).toHaveBeenCalledWith(Buffer.from("img"), Buffer.from("proof"));
      expect(r.gamut?.toString()).toBe("map");
      expect(r.report.checks.find((c) => c.id === "gamut")?.status).toBe("warn");
    } finally {
      await r.dispose();
    }
  });
});
