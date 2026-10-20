import type { TextElement } from "../schema/project.js";

// Posición x de una caja de texto que pasa a medir `width` dejando quieto el borde que marca la
// alineación (el centro si va centrada o justificada).
export function anchorX(el: Pick<TextElement, "x" | "width" | "align">, width: number): number {
  const grow = width - el.width;
  return el.align === "left" ? el.x : el.align === "right" ? el.x - grow : el.x - grow / 2;
}
