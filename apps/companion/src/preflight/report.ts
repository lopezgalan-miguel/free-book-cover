import { POINTS_PER_INCH, MIN_PPI } from "./toCmykPdf.js";
import type { PdfInspection } from "./inspect.js";

export type CheckStatus = "pass" | "warn" | "fail";

/** Comprobación con identificador estable; el editor la redacta en ES/CA a partir de `params`. */
export interface PreflightCheck {
  id: CheckId;
  status: CheckStatus;
  params?: Record<string, string | number>;
}

export type CheckId =
  | "input" | "pages" | "size" | "ppi" | "cmyk" | "transparency" | "fonts" | "encryption" | "structure" | "weight" | "ink";

export const WEIGHT_TARGET_BYTES = 40 * 1024 * 1024;
export const WEIGHT_MAX_BYTES = 200 * 1024 * 1024;
/** Umbral de tinta total (aviso, no bloqueante). */
export const INK_LIMIT_PERCENT = 300;
/** Tolerancia del tamaño de página, en puntos. */
export const SIZE_TOLERANCE_PT = 0.01;

export interface PreflightReport {
  /** true solo si ninguna comprobación falla (los avisos no bloquean). */
  ok: boolean;
  checks: PreflightCheck[];
  measured: {
    pageSizePt: { width: number; height: number } | null;
    expectedSizePt: { width: number; height: number };
    minPpi: number | null;
    bytes: number | null;
    maxInkPercent: number | null;
    encoding: string | null;
  };
}

export interface ReportInput {
  inspection: PdfInspection;
  maxInkPercent: number;
  expected: { widthIn: number; heightIn: number };
  encoding: string;
}

const st = (bad: boolean): CheckStatus => (bad ? "fail" : "pass");

/** Evalúa la inspección contra la lista de comprobaciones de R-07. Función pura. */
export function buildReport({ inspection: r, maxInkPercent, expected, encoding }: ReportInput): PreflightReport {
  const w = expected.widthIn * POINTS_PER_INCH;
  const h = expected.heightIn * POINTS_PER_INCH;
  const sizeBad = Math.abs(r.pageSizePt.width - w) > SIZE_TOLERANCE_PT || Math.abs(r.pageSizePt.height - h) > SIZE_TOLERANCE_PT;
  const minPpi = r.images.length ? Math.min(...r.images.map((i) => Math.min(i.ppiX, i.ppiY))) : null;
  const notCmyk = r.images.filter((i) => i.color !== "cmyk");
  const unembedded = r.fonts.filter((f) => !f.embedded);
  const weight: CheckStatus = r.fileSizeBytes > WEIGHT_MAX_BYTES ? "fail" : r.fileSizeBytes > WEIGHT_TARGET_BYTES ? "warn" : "pass";

  const checks: PreflightCheck[] = [
    { id: "pages", status: st(r.pageCount !== 1), params: { pages: r.pageCount } },
    {
      id: "size", status: st(sizeBad),
      params: { width: r.pageSizePt.width, height: r.pageSizePt.height, expectedWidth: w, expectedHeight: h },
    },
    { id: "ppi", status: st(minPpi === null || minPpi < MIN_PPI), params: { ppi: minPpi ?? 0, min: MIN_PPI } },
    {
      id: "cmyk", status: st(r.images.length === 0 || notCmyk.length > 0 || r.images.some((i) => i.type !== "image")),
      params: { space: notCmyk[0]?.color ?? "cmyk" },
    },
    { id: "transparency", status: st(r.transparency.length > 0), params: { count: r.transparency.length } },
    { id: "fonts", status: st(unembedded.length > 0), params: { count: unembedded.length } },
    { id: "encryption", status: st(r.encrypted) },
    { id: "structure", status: st(!r.structureOk) },
    { id: "weight", status: weight, params: { bytes: r.fileSizeBytes, target: WEIGHT_TARGET_BYTES, max: WEIGHT_MAX_BYTES } },
    { id: "ink", status: maxInkPercent > INK_LIMIT_PERCENT ? "warn" : "pass", params: { percent: Math.round(maxInkPercent), limit: INK_LIMIT_PERCENT } },
  ];
  return {
    ok: checks.every((c) => c.status !== "fail"),
    checks,
    measured: {
      pageSizePt: r.pageSizePt, expectedSizePt: { width: w, height: h }, minPpi, bytes: r.fileSizeBytes,
      maxInkPercent, encoding,
    },
  };
}

/** Informe cuando ni siquiera se pudo generar el PDF (entrada rechazada). */
export function inputFailureReport(expected: { widthIn: number; heightIn: number }, reason: string): PreflightReport {
  return {
    ok: false,
    checks: [{ id: "input", status: "fail", params: { reason } }],
    measured: {
      pageSizePt: null, expectedSizePt: { width: expected.widthIn * POINTS_PER_INCH, height: expected.heightIn * POINTS_PER_INCH },
      minPpi: null, bytes: null, maxInkPercent: null, encoding: null,
    },
  };
}
