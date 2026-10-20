import type { TextElement, TextRun } from "../schema/project.js";
import { layoutText, type TextMeasure } from "./layout.js";

const FIT_PPI = 300;
const MIN_PT = 6;
const MAX_PT = 300;
// Por debajo de este desvío respecto a 1 el texto se considera ya ajustado.
const FIT_EPSILON = 0.005;
// Ancho (in) que equivale a «sin ajuste de línea»: solo cuentan los saltos escritos.
const NO_WRAP_IN = 100000;

// Ancho (in) de la línea más ancha sin ajuste de línea; 0 si no hay texto.
function widestLineIn(el: TextElement, runs: TextRun[], measure: TextMeasure): number {
  // Alineada a la izquierda para que el reparto de la justificación no ensanche las líneas.
  const lines = layoutText({ ...el, runs, width: NO_WRAP_IN, align: "left" }, FIT_PPI, measure).lines;
  return Math.max(0, ...lines.map((l) => l.width)) / FIT_PPI;
}

// Escala el cuerpo de todos los fragmentos por el mismo factor (6–300 pt, décimas de punto) para que la línea
// más ancha llene la caja. Devuelve null en texto curvo, sin texto o si ya está ajustado.
export function fitFontToWidth(el: TextElement, measure: TextMeasure): TextRun[] | null {
  if (el.curvature !== 0 || el.runs.every((r) => r.text === "")) return null;
  const sizes = el.runs.map((r) => r.fontSizePt);
  const scale = (runs: TextRun[], factor: number): TextRun[] => {
    // El factor se acota para que ningún fragmento salga del rango y se conserven las proporciones.
    const lo = MIN_PT / Math.min(...runs.map((r) => r.fontSizePt));
    const hi = MAX_PT / Math.max(...runs.map((r) => r.fontSizePt));
    const f = Math.max(Math.min(lo, hi), Math.min(hi, factor));
    return runs.map((r) => ({ ...r, fontSizePt: Math.min(MAX_PT, Math.max(MIN_PT, Math.round(r.fontSizePt * f * 10) / 10)) }));
  };
  const w1 = widestLineIn(el, el.runs, measure);
  if (w1 <= 0 || sizes.some((s) => !(s > 0))) return null;
  const factor = el.width / w1;
  if (Math.abs(factor - 1) < FIT_EPSILON) return null;
  let runs = scale(el.runs, factor);
  // La medida no es lineal (redondeos del tipo): una pasada más corrige el resto.
  const w2 = widestLineIn(el, runs, measure);
  if (w2 > 0) runs = scale(runs, el.width / w2);
  return runs.every((r, i) => r.fontSizePt === el.runs[i]!.fontSizePt) ? null : runs;
}
