import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { bins, run } from "./exec.js";

export const POINTS_PER_INCH = 72;
export const MIN_PPI = 300;

/** Política de color documentada en PREFLIGHT.md. */
export const colorPolicy = {
  sourceProfile: "srgb.icc",
  outputProfile: "default_cmyk.icc",
  renderIntent: 1, // colorimétrico relativo
  blackPointCompensation: true,
} as const;

export type ImageEncoding = "flate" | "jpeg";

export interface CmykPdfInput {
  /** PNG opaco en sRGB, ya compuesto a tamaño final (sin guías). */
  image: Buffer;
  widthIn: number;
  heightIn: number;
  outputPath: string;
  encoding?: ImageEncoding;
}

export class PreflightInputError extends Error {}

/** Comprueba la imagen de entrada y devuelve sus ppp efectivos. */
export async function checkInputImage(image: Buffer, widthIn: number, heightIn: number) {
  const meta = await sharp(image).metadata();
  if (meta.format !== "png") throw new PreflightInputError(`Formato no admitido: ${meta.format}`);
  if (meta.hasAlpha) throw new PreflightInputError("La imagen tiene canal alfa; debe llegar aplanada");
  if (!meta.width || !meta.height) throw new PreflightInputError("No se pudieron leer las dimensiones");
  const ppiX = meta.width / widthIn;
  const ppiY = meta.height / heightIn;
  if (Math.abs(ppiX - ppiY) > 0.5) {
    throw new PreflightInputError(`Proporción distinta a la página: ${ppiX.toFixed(2)} × ${ppiY.toFixed(2)} ppp`);
  }
  return { widthPx: meta.width, heightPx: meta.height, ppi: Math.min(ppiX, ppiY) };
}

/** Página RGB de tamaño físico exacto con la imagen a sangre. */
async function buildRgbPdf(image: Buffer, widthIn: number, heightIn: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const w = widthIn * POINTS_PER_INCH;
  const h = heightIn * POINTS_PER_INCH;
  const page = doc.addPage([w, h]);
  page.drawImage(await doc.embedPng(image), { x: 0, y: 0, width: w, height: h });
  return doc.save({ useObjectStreams: false });
}

function ghostscriptArgs(input: string, output: string, encoding: ImageEncoding): string[] {
  const args = [
    "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.3", // sin funciones de transparencia
    "-sColorConversionStrategy=CMYK",
    "-sProcessColorModel=DeviceCMYK",
    `-sDefaultRGBProfile=${colorPolicy.sourceProfile}`,
    `-sOutputICCProfile=${colorPolicy.outputProfile}`,
    `-dRenderIntent=${colorPolicy.renderIntent}`,
    `-dBlackPtComp=${colorPolicy.blackPointCompensation ? 1 : 0}`,
    "-dOverrideICC=true",
    "-dDownsampleColorImages=false",
    "-dAutoFilterColorImages=false",
    "-dEmbedAllFonts=true",
    `-sOutputFile=${output}`,
  ];
  if (encoding === "flate") {
    args.push("-dColorImageFilter=/FlateEncode", "-f", input);
  } else {
    args.push(
      "-dColorImageFilter=/DCTEncode",
      "-c", "<< /ColorImageDict << /QFactor 0.15 /Blocks 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> >> setdistillerparams",
      "-f", input,
    );
  }
  return args;
}

export async function toCmykPdf(input: CmykPdfInput): Promise<{ ppi: number }> {
  const { ppi } = await checkInputImage(input.image, input.widthIn, input.heightIn);
  if (ppi < MIN_PPI) throw new PreflightInputError(`Resolución insuficiente: ${ppi.toFixed(1)} ppp`);

  const dir = await mkdtemp(join(tmpdir(), "fbc-preflight-"));
  try {
    const rgbPath = join(dir, "rgb.pdf");
    await writeFile(rgbPath, await buildRgbPdf(input.image, input.widthIn, input.heightIn));
    await run(bins.gs, ghostscriptArgs(rgbPath, input.outputPath, input.encoding ?? "flate"));
    return { ppi };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { buildRgbPdf as _buildRgbPdfForTests };
