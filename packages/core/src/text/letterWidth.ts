import type { TextElement } from "../schema/project.js";

// Posición x de una caja de texto que pasa a medir `width` dejando quieto el borde que marca la
// alineación (el centro si va centrada o justificada).
export function anchorX(el: Pick<TextElement, "x" | "width" | "align">, width: number): number {
  const grow = width - el.width;
  return el.align === "left" ? el.x : el.align === "right" ? el.x - grow : el.x - grow / 2;
}

// Cambiar la anchura de letra no vuelve a partir las líneas: la caja se ensancha o estrecha en la misma
// proporción. Se queda quieto el borde que marca la alineación (el centro si va centrado o justificado).
export function letterWidthPatch(
  el: Pick<TextElement, "x" | "width" | "align" | "scaleX">,
  scaleX: number,
): { scaleX: number; width: number; x: number } {
  const width = (el.width * scaleX) / (el.scaleX ?? 1);
  return { scaleX, width, x: anchorX(el, width) };
}
