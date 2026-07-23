/**
 * CONTRATO · clamp
 * ----------------
 * Restringe un número al rango [min, max]. Se usa en todas partes donde el
 * usuario mueve sliders o arrastra bloques, para que un valor nunca se salga
 * de sus límites válidos.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
