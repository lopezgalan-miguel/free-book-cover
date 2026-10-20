import { describe, expect, it, vi } from "vitest";
import { runPreflight, type PreflightSteps } from "../src/preflight/pipeline.js";
import { WEIGHT_TARGET_BYTES } from "../src/preflight/report.js";
import { PreflightInputError } from "../src/preflight/toCmykPdf.js";
import type { PdfInspection } from "../src/preflight/inspect.js";

const inspection = (fileSizeBytes: number): PdfInspection => ({
  pageCount: 1, pageSizePt: { width: 12 * 72, height: 9 * 72 }, encrypted: false, images: [], fonts: [], transparency: [], structureOk: true, fileSizeBytes,
});
const steps = (sizes: number[]): PreflightSteps => ({
  flatten: vi.fn(async (b: Buffer) => b),
  toPdf: vi.fn(async () => ({ ppi: 300 })),
  inspect: vi.fn(async () => inspection(sizes.shift()!)),
  measureInk: vi.fn(async () => 250),
  proof: vi.fn(async () => Buffer.from("png")),
  gamut: vi.fn(async () => ({ percent: 0, maxDeltaE: 0, png: Buffer.from("map") })),
});
const req = { image: Buffer.from("x"), widthIn: 12, heightIn: 9 };

describe("runPreflight con pasos sustituidos", () => {
  it("si el PDF supera el peso objetivo, se repite en JPEG y se usa el segundo", async () => {
    const s = steps([WEIGHT_TARGET_BYTES + 1, 1000]);
    const r = await runPreflight(req, s);
    try {
      expect((s.toPdf as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].encoding)).toEqual(["flate", "jpeg"]);
      expect(r.pdfPath).toMatch(/cover-jpeg\.pdf$/);
    } finally {
      await r.dispose();
    }
  });

  it("dentro del peso objetivo se queda en Flate", async () => {
    const s = steps([1000]);
    const r = await runPreflight(req, s);
    try {
      expect(s.toPdf).toHaveBeenCalledTimes(1);
      expect(r.pdfPath).toMatch(/cover\.pdf$/);
    } finally {
      await r.dispose();
    }
  });

  it("una entrada rechazada devuelve el informe de fallo sin PDF", async () => {
    const s = steps([]);
    s.flatten = vi.fn(async () => { throw new PreflightInputError("La imagen tiene transparencias"); });
    const r = await runPreflight(req, s);
    try {
      expect(r.pdfPath).toBeNull();
      expect(r.report.ok).toBe(false);
      expect(s.toPdf).not.toHaveBeenCalled();
    } finally {
      await r.dispose();
    }
  });
});
