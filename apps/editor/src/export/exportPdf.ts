import {
  buildPreflightSummary, checkExportSize, exportFileName, printPixelSize,
  type FontProblem, type PreflightSummary, type Project,
} from "@free-book-cover/core";
import { CompanionError, type CompanionClient, type CompanionConfig } from "./companionClient";
import type { ExportDeps } from "./exportImage";
import type { PrintRenderer, RenderStage, RenderVia } from "./printRender";

export type PdfStage = RenderStage | "companion" | "download";
// Orden de las etapas para la barra de progreso.
export const PDF_STAGES: readonly PdfStage[] = ["fonts", "images", "paint", "encode", "companion", "download"];

export interface PdfExportDeps {
  fonts: ExportDeps["fonts"];
  missingAssets: ExportDeps["missingAssets"];
  renderer: PrintRenderer;
  companion: CompanionClient;
  config: CompanionConfig;
}

export type PdfError =
  | { kind: "not_kdp" }
  | { kind: "limit"; megapixels: number; limitMegapixels: number }
  | { kind: "fonts"; problems: FontProblem[] }
  | { kind: "missing_assets"; assetIds: string[] }
  | { kind: "render_failed"; message: string }
  | { kind: "companion"; reason: "offline" | "unauthorized" | "failed" };

export interface PdfResult {
  summary: PreflightSummary;
  // PDF generado; null si el companion rechazó la entrada. Si el estado no es «ready» es una prueba.
  pdf: Blob | null;
  proofPng: string | null;
  fileName: string;
  reportFileName: string;
  via: RenderVia;
  sizePx: { widthPx: number; heightPx: number };
  widthIn: number;
  heightIn: number;
}

export type PdfOutcome = { ok: true; result: PdfResult } | { ok: false; error: PdfError };

// Flujo del Paso 7: comprobaciones previas -> render 300 ppp sin guías -> companion (CMYK + inspección) -> informe.
// Nada se concede por omisión: el estado «ready» sale de buildPreflightSummary, que exige la inspección del PDF.
export async function runPdfExport(
  doc: Project, projectName: string, deps: PdfExportDeps, onStage: (s: PdfStage) => void = () => {},
): Promise<PdfOutcome> {
  if (doc.mode !== "kdp-paperback" || !doc.printSetup) return { ok: false, error: { kind: "not_kdp" } };
  const size = printPixelSize(doc.canvas.widthIn, doc.canvas.heightIn);
  const limit = checkExportSize(size.widthPx, size.heightPx);
  if (!limit.ok && limit.error.kind === "export_too_many_megapixels") {
    return { ok: false, error: { kind: "limit", megapixels: limit.error.megapixels, limitMegapixels: limit.error.limitMegapixels } };
  }
  deps.fonts.ensureDoc(doc);
  await deps.fonts.whenSettled(doc);
  const fonts = deps.fonts.checkFontsReady(doc);
  if (!fonts.ok) return { ok: false, error: { kind: "fonts", problems: fonts.problems } };
  const missing = deps.missingAssets(doc);
  if (missing.length) return { ok: false, error: { kind: "missing_assets", assetIds: missing } };

  let rendered;
  try {
    rendered = await deps.renderer.render(doc, size, onStage);
  } catch (e) {
    return { ok: false, error: { kind: "render_failed", message: String((e as Error)?.message ?? e) } };
  }
  onStage("companion");
  let resp;
  try {
    resp = await deps.companion.preflight(deps.config, rendered.blob, doc.canvas.widthIn, doc.canvas.heightIn);
  } catch (e) {
    return { ok: false, error: { kind: "companion", reason: e instanceof CompanionError ? e.kind : "failed" } };
  }
  let pdf: Blob | null = null;
  if (resp.id) {
    onStage("download");
    try {
      pdf = await deps.companion.downloadPdf(deps.config, resp.id);
    } catch (e) {
      return { ok: false, error: { kind: "companion", reason: e instanceof CompanionError ? e.kind : "failed" } };
    }
  }
  const summary = buildPreflightSummary(doc, resp.report);
  const stem = exportFileName(projectName, "kdp", "png", size.widthPx, size.heightPx).replace(/\.png$/, "");
  return {
    ok: true,
    result: {
      summary, pdf, proofPng: resp.proofPng,
      // Una prueba nunca se llama como un archivo validado.
      fileName: summary.state === "ready" ? `${stem}.pdf` : `${stem}-PRUEBA-NO-VALIDADA.pdf`,
      reportFileName: `${stem}-informe-preimpresion.txt`,
      via: rendered.via, sizePx: size, widthIn: doc.canvas.widthIn, heightIn: doc.canvas.heightIn,
    },
  };
}
