import type { TextElement } from "../schema/project.js";
import { layoutText, type TextMeasure } from "./layout.js";
import { anchorX } from "./letterWidth.js";

// Diferencia (in) por debajo de la cual la caja se considera ya ajustada.
export const FIT_TOLERANCE_IN = 0.001;
const FIT_PPI = 300;

// Caja ajustada al texto: ancho al menos el de la palabra más larga (salvo en texto curvo) con el borde de
// la alineación quieto, y alto el del contenido. Devuelve null si la caja ya está ajustada.
export function fitTextBox(el: TextElement, measure: TextMeasure): { x: number; width: number; height: number } | null {
  const first = layoutText(el, FIT_PPI, measure);
  const width = el.curvature !== 0 ? el.width : Math.max(el.width, first.minWidthPx / FIT_PPI);
  const height = layoutText({ ...el, width }, FIT_PPI, measure).heightPx / FIT_PPI;
  if (Math.abs(width - el.width) < FIT_TOLERANCE_IN && Math.abs(height - el.height) < FIT_TOLERANCE_IN) return null;
  return { x: anchorX(el, width), width, height };
}
