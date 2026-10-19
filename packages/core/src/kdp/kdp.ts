import type { Rect } from "../geometry/fit.js";
import type { Project } from "../schema/project.js";

// Valores de KDP tapa blanda contrastados el 2026-10-02; cortes y máximos de páginas, el 2026-10-19 (ver sources.md).
export const BLEED_IN = 0.125;
export const SAFE_IN = 0.125;
export const SPINE_TEXT_MARGIN_IN = 0.0625;
export const SPINE_TEXT_MIN_PAGES = 79;
export const SPINE_TOLERANCE_IN = 0.0125;
export const BARCODE = { widthIn: 2, heightIn: 1.2, gapIn: 0.25 } as const;
export const MIN_PAGES = 24;
export const CUSTOM_TRIM = { minW: 4, maxW: 8.5, minH: 6, maxH: 11.69 } as const;

export type PaperId = "bw-white" | "bw-cream" | "color-standard" | "color-premium";
export interface PaperSpec {
  id: PaperId;
  thicknessIn: number;
  minPages: number;
}
export const PAPERS: readonly PaperSpec[] = [
  { id: "bw-white", thicknessIn: 0.002252, minPages: 24 },
  { id: "bw-cream", thicknessIn: 0.0025, minPages: 24 },
  { id: "color-standard", thicknessIn: 0.002252, minPages: 72 },
  { id: "color-premium", thicknessIn: 0.002347, minPages: 24 },
];
export const findPaper = (id: string): PaperSpec | undefined => PAPERS.find((p) => p.id === id);

// Máximo de páginas por papel; null = el corte no admite ese papel.
export type MaxPages = Readonly<Record<PaperId, number | null>>;
export interface TrimSpec {
  widthIn: number;
  heightIn: number;
  maxPages: MaxPages;
}
const max = (bwWhite: number, bwCream: number, colorStandard: number | null, colorPremium: number): MaxPages => ({
  "bw-white": bwWhite, "bw-cream": bwCream, "color-standard": colorStandard, "color-premium": colorPremium,
});
const REGULAR = max(828, 776, 600, 828);
// Tabla oficial de kdp.amazon.com («Paperback Submission Guidelines», G201834240), en su orden. Los tamaños
// personalizados no tienen máximo publicado y se siguen rechazando (trim_unsupported).
export const SUPPORTED_TRIMS: readonly TrimSpec[] = [
  { widthIn: 5, heightIn: 8, maxPages: REGULAR },
  { widthIn: 5.06, heightIn: 7.81, maxPages: REGULAR },
  { widthIn: 5.25, heightIn: 8, maxPages: REGULAR },
  { widthIn: 5.5, heightIn: 8.5, maxPages: REGULAR },
  { widthIn: 6, heightIn: 9, maxPages: REGULAR },
  { widthIn: 6.14, heightIn: 9.21, maxPages: REGULAR },
  { widthIn: 6.69, heightIn: 9.61, maxPages: REGULAR },
  { widthIn: 7, heightIn: 10, maxPages: REGULAR },
  { widthIn: 7.44, heightIn: 9.69, maxPages: REGULAR },
  { widthIn: 7.5, heightIn: 9.25, maxPages: REGULAR },
  { widthIn: 8, heightIn: 10, maxPages: REGULAR },
  { widthIn: 8.25, heightIn: 6, maxPages: max(800, 750, 600, 800) },
  { widthIn: 8.25, heightIn: 8.25, maxPages: max(800, 750, 600, 800) },
  { widthIn: 8.27, heightIn: 11.69, maxPages: max(780, 730, null, 590) },
  { widthIn: 8.5, heightIn: 8.5, maxPages: max(590, 550, 600, 590) },
  { widthIn: 8.5, heightIn: 11, maxPages: max(590, 550, 600, 590) },
];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const findTrim = (w: number, h: number) => SUPPORTED_TRIMS.find((t) => same(t.widthIn, w) && same(t.heightIn, h));
export const isSupportedTrim = (w: number, h: number): boolean => findTrim(w, h) !== undefined;
// Máximo de páginas de un corte y papel; null si el corte no está en la tabla o no admite el papel.
export function maxPagesFor(w: number, h: number, paper: string): number | null {
  const t = findTrim(w, h);
  return t && findPaper(paper) ? (t.maxPages[paper as PaperId] ?? null) : null;
}
// Tamaño grande de KDP (otro coste de impresión): más de 6,12 in de ancho o más de 9 in de alto.
export const isLargeTrim = (w: number, h: number): boolean => w > 6.12 || h > 9;

export type PrintSetup = NonNullable<Project["printSetup"]>;

export type SetupIssue =
  | { kind: "trim_out_of_range" }
  | { kind: "trim_unsupported" }
  | { kind: "paper_unsupported" }
  | { kind: "paper_unavailable_for_trim" }
  | { kind: "pages_invalid" }
  | { kind: "pages_below_min"; min: number }
  | { kind: "pages_above_max"; max: number };

export type SetupResult = { ok: true } | { ok: false; issues: SetupIssue[] };

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function validatePrintSetup(s: PrintSetup): SetupResult {
  const issues: SetupIssue[] = [];
  const inRange =
    s.trimWidthIn >= CUSTOM_TRIM.minW && s.trimWidthIn <= CUSTOM_TRIM.maxW && s.trimHeightIn >= CUSTOM_TRIM.minH && s.trimHeightIn <= CUSTOM_TRIM.maxH;
  if (!inRange) issues.push({ kind: "trim_out_of_range" });
  else if (!isSupportedTrim(s.trimWidthIn, s.trimHeightIn)) issues.push({ kind: "trim_unsupported" });
  const paper = findPaper(s.paperAndInk);
  const trim = findTrim(s.trimWidthIn, s.trimHeightIn);
  const maxPages = trim && paper ? trim.maxPages[paper.id] : undefined;
  if (!paper) issues.push({ kind: "paper_unsupported" });
  else if (maxPages === null) issues.push({ kind: "paper_unavailable_for_trim" });
  if (!Number.isInteger(s.pageCount) || s.pageCount < 1) issues.push({ kind: "pages_invalid" });
  else if (paper) {
    if (s.pageCount < paper.minPages) issues.push({ kind: "pages_below_min", min: paper.minPages });
    // El máximo solo se conoce para los cortes de la tabla.
    else if (typeof maxPages === "number" && s.pageCount > maxPages) issues.push({ kind: "pages_above_max", max: maxPages });
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function spineWidthIn(pageCount: number, paperId: string): number {
  const paper = findPaper(paperId);
  if (!paper) throw new RangeError(`papel no admitido: ${paperId}`);
  return round6(pageCount * paper.thicknessIn);
}

// El texto del lomo exige 79 páginas o más y un lomo con espacio útil.
export const spineTextAllowed = (pageCount: number, spineIn: number): boolean =>
  pageCount >= SPINE_TEXT_MIN_PAGES && spineIn - 2 * SPINE_TEXT_MARGIN_IN > 0;

// ¿Coincide el lomo con el de la plantilla oficial dentro de la tolerancia de KDP?
export const spineWithinTolerance = (actualIn: number, officialIn: number): boolean => Math.abs(actualIn - officialIn) <= SPINE_TOLERANCE_IN + 1e-9;

export interface KdpLayout {
  widthIn: number;
  heightIn: number;
  spineIn: number;
  bleedIn: number;
  // Caras (corte): contraportada | lomo | portada. El sangrado queda entre cada cara y el borde del lienzo.
  back: Rect;
  spine: Rect;
  front: Rect;
  folds: [number, number];
  safe: { back: Rect; front: Rect };
  // Zona útil para texto del lomo; null si el lomo no admite texto.
  spineSafe: Rect | null;
  spineTextAllowed: boolean;
  barcode: Rect;
}

// Geometría completa a partir de datos de impresión válidos. Todo en pulgadas, origen arriba a la izquierda.
export function kdpLayout(s: PrintSetup): KdpLayout {
  const spineIn = spineWidthIn(s.pageCount, s.paperAndInk);
  const w = s.trimWidthIn;
  const h = s.trimHeightIn;
  const widthIn = round6(2 * w + spineIn + 2 * BLEED_IN);
  const heightIn = round6(h + 2 * BLEED_IN);
  const back: Rect = { x: BLEED_IN, y: BLEED_IN, width: w, height: h };
  const spine: Rect = { x: round6(BLEED_IN + w), y: BLEED_IN, width: spineIn, height: h };
  const front: Rect = { x: round6(BLEED_IN + w + spineIn), y: BLEED_IN, width: w, height: h };
  const inset = (r: Rect): Rect => ({ x: r.x + SAFE_IN, y: r.y + SAFE_IN, width: r.width - 2 * SAFE_IN, height: r.height - 2 * SAFE_IN });
  const allowed = spineTextAllowed(s.pageCount, spineIn);
  const barcode: Rect = {
    x: round6(back.x + w - BARCODE.gapIn - BARCODE.widthIn),
    y: round6(back.y + h - BARCODE.gapIn - BARCODE.heightIn),
    width: BARCODE.widthIn,
    height: BARCODE.heightIn,
  };
  return {
    widthIn, heightIn, spineIn, bleedIn: BLEED_IN, back, spine, front,
    folds: [spine.x, round6(spine.x + spineIn)],
    safe: { back: inset(back), front: inset(front) },
    spineSafe: allowed
      ? { x: spine.x + SPINE_TEXT_MARGIN_IN, y: back.y + SAFE_IN, width: spineIn - 2 * SPINE_TEXT_MARGIN_IN, height: h - 2 * SAFE_IN }
      : null,
    spineTextAllowed: allowed,
    barcode,
  };
}

// Cara en la que cae un punto horizontal (por el centro del elemento).
export type Zone = "back" | "spine" | "front";
export function zoneAt(layout: KdpLayout, x: number): Zone {
  if (x < layout.spine.x) return "back";
  if (x <= layout.spine.x + layout.spine.width) return "spine";
  return "front";
}
