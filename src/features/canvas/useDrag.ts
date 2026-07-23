/**
 * CONTRATO · useDrag
 * ------------------
 * Hook reutilizable para arrastrar un elemento (bloque de texto o imagen de
 * fondo) con puntero/tacto y devolver su nueva posición en PORCENTAJE del
 * lienzo (0–100), lista para escribir en el store.
 *
 * Cómo lo hará:
 *  - Escucha pointerdown/move/up (soporta ratón y táctil, `touch-action:none`).
 *  - Traduce las coordenadas del puntero a % relativo al rectángulo del lienzo.
 *  - Aplica clamp(0,100) para no salirse. Devuelve los handlers a enganchar y
 *    el estado de arrastre. No conoce el store: recibe el callback `onChange`.
 */

export interface UseDragOptions {
  /** Rectángulo del lienzo en pantalla, para traducir px → %. */
  getCanvasRect: () => DOMRect | null;
  /** Se llama con la nueva posición (x, y) en % durante el arrastre. */
  onChange: (position: { x: number; y: number }) => void;
}

export interface UseDragResult {
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}

export function useDrag(_options: UseDragOptions): UseDragResult {
  // TODO(equipo): implementar el ciclo pointerdown/move/up con clamp a [0,100].
  return {
    isDragging: false,
    onPointerDown: () => {},
  };
}
