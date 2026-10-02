import type { Rect } from "../geometry/fit.js";
import type { Project } from "../schema/project.js";

// Valores de KDP tapa blanda contrastados el 2026-10-02 (ver sources.md).
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
  // Máximo de páginas para 5 × 8 y 6 × 9 in (los únicos tamaños contrastados).
  maxPages: number;
}
export const PAPERS: readonly PaperSpec[] = [
  { id: "bw-white", thicknessIn: 0.002252, minPages: 24, maxPages: 828 },
  { id: "bw-cream", thicknessIn: 0.0025, minPages: 24, maxPages: 776 },
  { id: "color-standard", thicknessIn: 0.002252, minPages: 72, maxPages: 600 },
  { id: "color-premium", thicknessIn: 0.002347, minPages: 24, maxPages: 828 },
];
export const findPaper = (id: string): PaperSpec | undefined => PAPERS.find((p) => p.id === id);

// Tamaños de corte cuyo máximo de páginas está contrastado. Los demás se rechazan (ver sources.md).
export const SUPPORTED_TRIMS: ReadonlyArray<{ widthIn: number; heightIn: number }> = [
  { widthIn: 5, heightIn: 8 },
  { widthIn: 6, heightIn: 9 },
];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
export const isSupportedTrim = (w: number, h: number): boolean => SUPPORTED_TRIMS.some((t) => same(t.widthIn, w) && same(t.heightIn, h));

export type PrintSetup = NonNullable<Project["printSetup"]>;

export type SetupIssue =
  | { kind: "trim_out_of_range" }
  | { kind: "trim_unsupported" }
  | { kind: "paper_unsupported" }
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
  if (!paper) issues.push({ kind: "paper_unsupported" });
  if (!Number.isInteger(s.pageCount) || s.pageCount < 1) issues.push({ kind: "pages_invalid" });
  else if (paper) {
    if (s.pageCount < paper.minPages) issues.push({ kind: "pages_below_min", min: paper.minPages });
    // El máximo solo se conoce para los tamaños contrastados.
    else if (isSupportedTrim(s.trimWidthIn, s.trimHeightIn) && s.pageCount > paper.maxPages) issues.push({ kind: "pages_above_max", max: paper.maxPages });
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
