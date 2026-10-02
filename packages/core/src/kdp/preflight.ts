import { dpiReport } from "../render/renderDocument.js";
import type { Project } from "../schema/project.js";
import { TARGET_DPI } from "../images/dpi.js";
import { kdpLayout, validatePrintSetup } from "./kdp.js";
import { kdpReview } from "./review.js";

// Informe de preimpresión (SDD R-07): las comprobaciones del editor (antes de rasterizar) más las del
// companion (sobre el PDF final). «Listo para KDP» solo si ninguna falla y el companion ha inspeccionado el PDF.
export type CheckStatus = "pass" | "warn" | "fail";
export type CompanionCheckId =
  | "input" | "pages" | "size" | "ppi" | "cmyk" | "transparency" | "fonts" | "encryption" | "structure" | "weight" | "ink";
export type PreflightCheckId = CompanionCheckId | "project" | "resolution" | "review";

export interface PreflightCheck {
  id: PreflightCheckId;
  status: CheckStatus;
  params?: Record<string, string | number>;
}

// Forma del informe que devuelve el companion (apps/companion/src/preflight/report.ts).
export interface CompanionReport {
  ok: boolean;
  checks: Array<{ id: CompanionCheckId; status: CheckStatus; params?: Record<string, string | number> }>;
  measured: {
    pageSizePt: { width: number; height: number } | null;
    expectedSizePt: { width: number; height: number };
    minPpi: number | null;
    bytes: number | null;
    maxInkPercent: number | null;
    encoding: string | null;
  };
}

export type PreflightState = "ready" | "not_validated";

export interface PreflightSummary {
  state: PreflightState;
  checks: PreflightCheck[];
  /** Una comprobación con fallo o ausencia de inspección impide el estado validado. */
  failing: PreflightCheckId[];
}

// Tamaño en píxeles de la rasterización a 300 ppp: se redondea hacia arriba para no bajar de 300 ppp efectivos.
export function printPixelSize(widthIn: number, heightIn: number): { widthPx: number; heightPx: number } {
  return { widthPx: Math.ceil(widthIn * TARGET_DPI - 1e-6), heightPx: Math.ceil(heightIn * TARGET_DPI - 1e-6) };
}

const EPS = 1e-4;

// Comprobaciones que el editor sabe hacer sin rasterizar.
export function projectChecks(doc: Project): PreflightCheck[] {
  const setup = doc.printSetup;
  const layout = doc.mode === "kdp-paperback" && setup && validatePrintSetup(setup).ok ? kdpLayout(setup) : null;
  const geometryOk = !!layout && Math.abs(doc.canvas.widthIn - layout.widthIn) <= EPS && Math.abs(doc.canvas.heightIn - layout.heightIn) <= EPS;
  const checks: PreflightCheck[] = [
    { id: "project", status: geometryOk ? "pass" : "fail", params: layout ? { width: layout.widthIn, height: layout.heightIn } : {} },
  ];
  const low = dpiReport(doc).filter((e) => e.lowDpi);
  checks.push({
    id: "resolution", status: low.length ? "fail" : "pass",
    params: { count: low.length, min: low.length ? Math.floor(Math.min(...low.map((e) => e.dpi))) : TARGET_DPI, target: TARGET_DPI },
  });
  const review = kdpReview(doc);
  if (review && review.issues.length) checks.push({ id: "review", status: "warn", params: { count: review.issues.length } });
  return checks;
}

export function buildPreflightSummary(doc: Project, companion: CompanionReport | null): PreflightSummary {
  const checks: PreflightCheck[] = [...projectChecks(doc), ...(companion?.checks ?? [])];
  const failing = checks.filter((c) => c.status === "fail").map((c) => c.id);
  // Sin informe del companion no hay inspección del PDF: nunca se concede el estado validado.
  return { state: companion && failing.length === 0 && companion.ok ? "ready" : "not_validated", checks, failing };
}
