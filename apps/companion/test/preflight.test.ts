import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluate, inspectPdf } from "../src/preflight/inspect.js";
import { PreflightInputError, _buildRgbPdfForTests, toCmykPdf } from "../src/preflight/toCmykPdf.js";
import { sampleCover } from "./fixtures.js";

// Cubierta completa 6 × 9 in, 300 páginas en blanco: lomo 0,6756 in + sangrado.
const widthIn = 2 * 6 + 0.6756 + 2 * 0.125;
const heightIn = 9 + 2 * 0.125;
const out = join(import.meta.dirname, "out");

describe("cadena de preimpresión CMYK (entrega 1)", { timeout: 120_000 }, () => {
  let cover: Buffer;
  beforeAll(async () => {
    await mkdir(out, { recursive: true });
    cover = await sampleCover(widthIn, heightIn, 300);
  });

  it("genera un PDF de una página, tamaño exacto, imagen CMYK a ≥ 300 ppp y sin transparencias", async () => {
    const pdf = join(out, "cmyk-flate.pdf");
    await toCmykPdf({ image: cover, widthIn, heightIn, outputPath: pdf });
    const report = await inspectPdf(pdf);
    expect(evaluate(report, { widthIn, heightIn })).toEqual([]);
    expect(report.images).toHaveLength(1);
    expect(report.images[0]!.color).toBe("cmyk");
  });

  it("admite codificación JPEG manteniendo las comprobaciones", async () => {
    const pdf = join(out, "cmyk-jpeg.pdf");
    await toCmykPdf({ image: cover, widthIn, heightIn, outputPath: pdf, encoding: "jpeg" });
    const report = await inspectPdf(pdf);
    expect(evaluate(report, { widthIn, heightIn })).toEqual([]);
    expect(report.images[0]!.encoding).toBe("jpeg");
  });

  it("el inspector rechaza un PDF RGB a baja resolución", async () => {
    const pdf = join(out, "rgb-150.pdf");
    const lowRes = await sampleCover(widthIn, heightIn, 150);
    await writeFile(pdf, await _buildRgbPdfForTests(lowRes, widthIn, heightIn));
    const issues = evaluate(await inspectPdf(pdf), { widthIn, heightIn });
    expect(issues.some((i) => i.includes("rgb"))).toBe(true);
    expect(issues.some((i) => i.includes("ppp"))).toBe(true);
  });

  it("el inspector detecta un tamaño de página distinto al calculado", async () => {
    const report = await inspectPdf(join(out, "cmyk-flate.pdf"));
    expect(evaluate(report, { widthIn: widthIn + 0.01, heightIn })).not.toEqual([]);
  });

  it("rechaza imágenes por debajo de 300 ppp antes de convertir", async () => {
    const lowRes = await sampleCover(widthIn, heightIn, 200);
    await expect(toCmykPdf({ image: lowRes, widthIn, heightIn, outputPath: join(out, "x.pdf") })).rejects.toThrow(
      PreflightInputError,
    );
  });

  it("rechaza imágenes con canal alfa", async () => {
    const withAlpha = await sampleCover(widthIn, heightIn, 300, true);
    await expect(toCmykPdf({ image: withAlpha, widthIn, heightIn, outputPath: join(out, "x.pdf") })).rejects.toThrow(
      /alfa/,
    );
  });
});
