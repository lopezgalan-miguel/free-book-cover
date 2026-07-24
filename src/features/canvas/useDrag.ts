/**
 * CONTRATO · useDrag
 * ------------------
 * Hook reutilizable para arrastrar un elemento (bloque de texto o imagen de
 * fondo) con puntero/tacto y devolver su nueva posición en PORCENTAJE del
 * lienzo (0–100), lista para escribir en el store.
 *
 * Cómo lo hace:
 *  - Escucha pointerdown/move/up (soporta ratón y táctil, `touch-action:none`).
 *  - Traduce las coordenadas del puntero a % relativo al rectángulo del lienzo.
 *  - Aplica clamp(0,100) para no salirse. Devuelve los handlers a enganchar y
 *    el estado de arrastre. No conoce el store: recibe el callback `onChange`.
 */

import { useCallback, useRef, useState } from 'react';
import { clamp } from '@/utils/clamp';

export interface UseDragOptions {
  /** Rectángulo del lienzo en pantalla, para traducir px → %. */
  getCanvasRect: () => DOMRect | null;
  /** Posición actual del elemento en % (centro). Opcional: si se omite, el
   *  centro del elemento sigue al puntero. */
  getPosition?: () => { x: number; y: number };
  /** Se llama con la nueva posición (x, y) en % durante el arrastre. */
  onChange: (position: { x: number; y: number }) => void;
  /** Umbral en px para considerar que hay arrastre (y no un clic). */
  dragThreshold?: number;
}

export interface UseDragResult {
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}

const DRAG_THRESHOLD = 4;

export const useDrag = (dragOptions: UseDragOptions): UseDragResult => {
  const { getCanvasRect, getPosition, onChange, dragThreshold } = dragOptions;
  const [isDragging, setIsDragging] = useState(false);

  const pointerId = useRef<number | null>(null);
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moved = useRef(false);
  const startPx = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = getCanvasRect();
      if (!rect) return;

      const px = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const pointerPct = {
        x: clamp((px.x / rect.width) * 100, 0, 100),
        y: clamp((px.y / rect.height) * 100, 0, 100),
      };
      const current = getPosition ? getPosition() : pointerPct;
      offset.current = { x: current.x - pointerPct.x, y: current.y - pointerPct.y };

      pointerId.current = event.pointerId;
      moved.current = false;
      startPx.current = { x: event.clientX, y: event.clientY };

      const move = (e: PointerEvent) => {
        if (e.pointerId !== pointerId.current) return;
        const dx = e.clientX - startPx.current.x;
        const dy = e.clientY - startPx.current.y;
        if (!moved.current && Math.hypot(dx, dy) < (dragThreshold ?? DRAG_THRESHOLD)) {
          return;
        }
        moved.current = true;
        if (!isDragging) setIsDragging(true);

        const r = getCanvasRect();
        if (!r) return;
        const nx = clamp(((e.clientX - r.left) / r.width) * 100 + offset.current.x, 0, 100);
        const ny = clamp(((e.clientY - r.top) / r.height) * 100 + offset.current.y, 0, 100);
        onChange({ x: nx, y: ny });
      };

      const up = (e: PointerEvent) => {
        if (e.pointerId !== pointerId.current) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        pointerId.current = null;
        if (isDragging) setIsDragging(false);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [getCanvasRect, getPosition, onChange, dragThreshold, isDragging],
  );

  return { isDragging, onPointerDown };
};