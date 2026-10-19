import type { TextElement } from "../schema/project.js";

// Cambiar la anchura de letra no vuelve a partir las líneas: la caja se ensancha o estrecha en la misma
// proporción. Se queda quieto el borde que marca la alineación (el centro si va centrado o justificado).
export function letterWidthPatch(
  el: Pick<TextElement, "x" | "width" | "align" | "scaleX">,
  scaleX: number,
): { scaleX: number; width: number; x: number } {
  const width = (el.width * scaleX) / (el.scaleX ?? 1);
  const grow = width - el.width;
  const x = el.align === "left" ? el.x : el.align === "right" ? el.x - grow : el.x - grow / 2;
  return { scaleX, width, x };
}
