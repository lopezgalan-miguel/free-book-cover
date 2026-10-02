import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { inspectPdf } from "./inspect.js";
import { measureMaxInk } from "./ink.js";
import { renderProof } from "./proof.js";
import { WEIGHT_TARGET_BYTES, buildReport, inputFailureReport, type PreflightReport } from "./report.js";
import { PreflightInputError, toCmykPdf, type ImageEncoding } from "./toCmykPdf.js";

export interface PreflightRequest {
  /** PNG de la cubierta a tamaño final, sin guías. Puede venir con alfa si es totalmente opaco. */
  image: Buffer;
  widthIn: number;
  heightIn: number;
}

export interface PreflightResult {
  report: PreflightReport;
  /** Ruta del PDF generado dentro de `dir`; null si la entrada se rechazó. */
  pdfPath: string | null;
  /** Prueba visual PNG (sRGB) del PDF CMYK. */
  proof: Buffer | null;
  /** Directorio temporal a borrar con `dispose`. */
  dispose(): Promise<void>;
}

/** El canvas del navegador exporta RGBA: se acepta si todo el alfa es 255 y se aplana. */
export async function flattenOpaque(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  if (!meta.hasAlpha) return image;
  // El alfa es el último canal de las estadísticas.
  const alpha = (await sharp(image).stats()).channels.at(-1)!;
  if (alpha.min < 255) throw new PreflightInputError("La imagen tiene transparencias");
  return sharp(image).removeAlpha().png().toBuffer();
}

/** Cadena completa: PNG -> PDF CMYK (Flate; JPEG si pasa del objetivo de peso) -> inspección -> tinta -> prueba visual. */
export async function runPreflight(req: PreflightRequest): Promise<PreflightResult> {
  const expected = { widthIn: req.widthIn, heightIn: req.heightIn };
  const dir = await mkdtemp(join(tmpdir(), "fbc-job-"));
  const dispose = () => rm(dir, { recursive: true, force: true });
  try {
    const image = await flattenOpaque(req.image);
    let encoding: ImageEncoding = "flate";
    let pdfPath = join(dir, "cover.pdf");
    await toCmykPdf({ image, ...expected, outputPath: pdfPath, encoding });
    let inspection = await inspectPdf(pdfPath);
    if (inspection.fileSizeBytes > WEIGHT_TARGET_BYTES) {
      encoding = "jpeg";
      pdfPath = join(dir, "cover-jpeg.pdf");
      await toCmykPdf({ image, ...expected, outputPath: pdfPath, encoding });
      inspection = await inspectPdf(pdfPath);
    }
    const [maxInkPercent, proof] = await Promise.all([measureMaxInk(pdfPath), renderProof(pdfPath)]);
    return { report: buildReport({ inspection, maxInkPercent, expected, encoding }), pdfPath, proof, dispose };
  } catch (e) {
    if (e instanceof PreflightInputError) return { report: inputFailureReport(expected, e.message), pdfPath: null, proof: null, dispose };
    await dispose();
    throw e;
  }
}
