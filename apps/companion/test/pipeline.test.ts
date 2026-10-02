import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { inspectPdf } from "../src/preflight/inspect.js";
import { runPreflight } from "../src/preflight/pipeline.js";
import { startServer } from "../src/server/server.js";
import { sampleCover } from "./fixtures.js";

const widthIn = 12.4752;
const heightIn = 9.25;
const solid = (rgb: [number, number, number], w: number, h: number, alpha = 255) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: alpha / 255 } } }).png().toBuffer();

describe("pipeline de preimpresión completa", { timeout: 180_000 }, () => {
  it("PNG RGBA opaco -> PDF CMYK que mide lo calculado, informe ok, tinta y prueba visual", async () => {
    const png = await solid([32, 64, 96], Math.ceil(widthIn * 300), Math.ceil(heightIn * 300));
    const r = await runPreflight({ image: png, widthIn, heightIn });
    try {
      expect(r.report.ok).toBe(true);
      expect(r.report.checks.filter((c) => c.status === "fail")).toEqual([]);
      const insp = await inspectPdf(r.pdfPath!);
      expect(insp.pageSizePt.width).toBeCloseTo(widthIn * 72, 2);
      expect(insp.pageSizePt.height).toBeCloseTo(666, 2);
      expect(r.report.measured.maxInkPercent).toBeGreaterThan(0);
      // Prueba visual: PNG legible cuyo color se parece al original (el CMYK no es idéntico).
      const proof = sharp(r.proof!);
      const meta = await proof.metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBeGreaterThan(1000);
      const px = await proof.extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer();
      expect(Math.abs(px[0]! - 32)).toBeLessThan(40);
      expect(Math.abs(px[2]! - 96)).toBeLessThan(40);
    } finally {
      await r.dispose();
    }
  });

  it("negro puro: tinta total ~296 % medida; con relleno por encima de 300 no, sin bloquear", async () => {
    const png = await solid([0, 0, 0], Math.ceil(widthIn * 300), Math.ceil(heightIn * 300));
    const r = await runPreflight({ image: png, widthIn, heightIn });
    try {
      expect(r.report.measured.maxInkPercent!).toBeGreaterThan(280);
      expect(r.report.measured.maxInkPercent!).toBeLessThanOrEqual(300);
      expect(r.report.ok).toBe(true);
    } finally {
      await r.dispose();
    }
  });

  it("si Flate pasa del objetivo de 40 MB regenera en JPEG y lo informa", async () => {
    const png = await sharp({
      create: { width: 4200, height: 3000, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 70 } },
    }).png().toBuffer();
    const r = await runPreflight({ image: png, widthIn: 14, heightIn: 10 });
    try {
      expect(r.report.measured.encoding).toBe("jpeg");
      expect(r.report.measured.bytes!).toBeLessThan(40 * 1024 * 1024);
      expect(r.report.ok).toBe(true);
    } finally {
      await r.dispose();
    }
  });

  it("imagen con transparencias reales: informe con error de entrada y sin PDF", async () => {
    const r = await runPreflight({ image: await solid([1, 2, 3], 3800, 2800, 128), widthIn, heightIn });
    expect(r.pdfPath).toBeNull();
    expect(r.report.ok).toBe(false);
    expect(r.report.checks[0]).toMatchObject({ id: "input", status: "fail" });
    await r.dispose();
  });

  it("por debajo de 300 ppp: error de entrada, sin estado ok", async () => {
    const r = await runPreflight({ image: await sampleCover(widthIn, heightIn, 200), widthIn, heightIn });
    expect(r.report.ok).toBe(false);
    expect(r.pdfPath).toBeNull();
    await r.dispose();
  });

  it("extremo a extremo por HTTP con el servidor real", async () => {
    const s = await startServer({ token: "t", allowedOrigins: ["http://localhost:1"], port: 0 });
    try {
      const png = await solid([200, 30, 30], Math.ceil(widthIn * 300), Math.ceil(heightIn * 300));
      const j = await (await fetch(`${s.url}/preflight?widthIn=${widthIn}&heightIn=${heightIn}`, {
        method: "POST", body: png, headers: { authorization: "Bearer t" },
      })).json();
      expect(j.report.ok).toBe(true);
      const pdf = Buffer.from(await (await fetch(`${s.url}/preflight/${j.id}/pdf`, { headers: { authorization: "Bearer t" } })).arrayBuffer());
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await s.close();
    }
  });
});
