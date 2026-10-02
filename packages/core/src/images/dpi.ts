// ppp efectivos (SDD D-04, R-03): píxeles de origen realmente usados por pulgada impresa.
export const TARGET_DPI = 300;

export function effectiveDpi(srcPxW: number, srcPxH: number, drawnInW: number, drawnInH: number): number | null {
  if (![srcPxW, srcPxH, drawnInW, drawnInH].every((v) => Number.isFinite(v) && v > 0)) return null;
  // Con deformación (estirar) manda el eje peor.
  return Math.min(srcPxW / drawnInW, srcPxH / drawnInH);
}

export const isLowDpi = (dpi: number | null, target: number = TARGET_DPI): boolean => dpi !== null && dpi < target;
