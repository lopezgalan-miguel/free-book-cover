import { rotatePoint, type Rect } from "../geometry/fit.js";
import { assetDims } from "../render/renderDocument.js";
import type { Element, Project } from "../schema/project.js";
import { kdpLayout, validatePrintSetup, zoneAt, type KdpLayout } from "./kdp.js";

const EPS = 1e-6;

export type ReviewIssue =
  | { kind: "text_outside_safe"; elementId: string }
  | { kind: "text_over_fold"; elementId: string }
  | { kind: "spine_text_invalid"; elementId: string; reason: "too_few_pages" | "outside_spine_safe" }
  | { kind: "barcode_overlap"; elementId: string }
  | { kind: "outside_canvas"; elementId: string }
  | { kind: "background_not_covering_bleed" }
  | { kind: "canvas_mismatch" };

export interface KdpReview {
  layout: KdpLayout;
  issues: ReviewIssue[];
}

// Caja envolvente (pulgadas) del elemento, con su giro.
export function rotatedBounds(e: Pick<Element, "x" | "y" | "width" | "height" | "rotation">): Rect {
  const c = { x: e.x + e.width / 2, y: e.y + e.height / 2 };
  const pts = [
    { x: e.x, y: e.y }, { x: e.x + e.width, y: e.y }, { x: e.x + e.width, y: e.y + e.height }, { x: e.x, y: e.y + e.height },
  ].map((p) => (e.rotation ? rotatePoint(p, c, e.rotation) : p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const inside = (r: Rect, outer: Rect) =>
  r.x >= outer.x - EPS && r.y >= outer.y - EPS && r.x + r.width <= outer.x + outer.width + EPS && r.y + r.height <= outer.y + outer.height + EPS;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width - EPS && a.x + a.width > b.x + EPS && a.y < b.y + b.height - EPS && a.y + a.height > b.y + EPS;

// Elementos visibles que no caben enteros en el lienzo (los que quedan fuera tras recalcular).
export function elementsOutsideCanvas(doc: Project): string[] {
  const canvas: Rect = { x: 0, y: 0, width: doc.canvas.widthIn, height: doc.canvas.heightIn };
  return doc.elements.filter((e) => e.visible && !inside(rotatedBounds(e), canvas)).map((e) => e.id);
}

// ¿El fondo cubre todo el lienzo, sangrado incluido?
export function backgroundCoversBleed(doc: Project): boolean {
  const bg = doc.canvas.background;
  if (typeof bg === "string") return true;
  const fit = doc.canvas.backgroundFit ?? "cover";
  if (fit !== "contain") return true;
  const dims = assetDims(doc.assets.find((a) => a.id === bg.assetId));
  return !!dims && Math.abs(dims.widthPx / dims.heightPx - doc.canvas.widthIn / doc.canvas.heightIn) < 1e-6;
}

// Revisión automática (ayuda, no aprobación de KDP). null si el proyecto no es una cubierta KDP válida.
export function kdpReview(doc: Project): KdpReview | null {
  if (doc.mode !== "kdp-paperback" || !doc.printSetup || !validatePrintSetup(doc.printSetup).ok) return null;
  const layout = kdpLayout(doc.printSetup);
  const issues: ReviewIssue[] = [];
  if (Math.abs(doc.canvas.widthIn - layout.widthIn) > 1e-4 || Math.abs(doc.canvas.heightIn - layout.heightIn) > 1e-4) issues.push({ kind: "canvas_mismatch" });
  if (!backgroundCoversBleed(doc)) issues.push({ kind: "background_not_covering_bleed" });
  const outside = new Set(elementsOutsideCanvas(doc));
  for (const e of doc.elements) {
    if (!e.visible) continue;
    if (outside.has(e.id)) issues.push({ kind: "outside_canvas", elementId: e.id });
    if (e.type !== "text") continue;
    const b = rotatedBounds(e);
    const zone = zoneAt(layout, b.x + b.width / 2);
    if (zone === "spine") {
      if (!layout.spineTextAllowed || !layout.spineSafe) issues.push({ kind: "spine_text_invalid", elementId: e.id, reason: "too_few_pages" });
      else if (!inside(b, layout.spineSafe)) issues.push({ kind: "spine_text_invalid", elementId: e.id, reason: "outside_spine_safe" });
      continue;
    }
    // Un texto de portada o contraportada que invade el lomo cruza el pliegue.
    if (overlaps(b, layout.spine) && layout.spine.width > 0) {
      issues.push({ kind: "text_over_fold", elementId: e.id });
      continue;
    }
    if (!inside(b, layout.safe[zone])) issues.push({ kind: "text_outside_safe", elementId: e.id });
    if (zone === "back" && overlaps(b, layout.barcode)) issues.push({ kind: "barcode_overlap", elementId: e.id });
  }
  return { layout, issues };
}
