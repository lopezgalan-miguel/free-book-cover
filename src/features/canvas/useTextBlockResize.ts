/** Gestiona el gesto de resize proporcional y sus listeners globales. */
import { useEffect, useRef } from 'react';
import { clamp } from '@/utils/clamp';
import type { TextBlock } from '@/types/editor';

const BOX_MIN = 2;
const BOX_MAX = 100;

interface ResizeSnapshot {
  pointerId: number;
  centerX: number;
  centerY: number;
  startDistance: number;
  startWidthPct: number;
  startHeightPct: number;
}

interface UseTextBlockResizeOptions {
  disabled: boolean;
  hasExplicitBox: boolean;
  getCanvasRect: () => DOMRect | null;
  onSelect: () => void;
  onChange: (patch: Pick<TextBlock, 'boxWidthPct' | 'boxHeightPct'>) => void;
}

export const useTextBlockResize = ({
  disabled,
  hasExplicitBox,
  getCanvasRect,
  onSelect,
  onChange,
}: UseTextBlockResizeOptions) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeSnapshot | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);

  useEffect(() => () => cleanupRef.current(), []);

  const onResizePointerDown = (event: React.PointerEvent) => {
    if (disabled) return;
    event.stopPropagation();
    event.preventDefault();

    const shell = shellRef.current;
    const canvasRect = getCanvasRect();
    if (!shell || !canvasRect || canvasRect.width === 0 || canvasRect.height === 0) return;

    cleanupRef.current();
    onSelect();

    const shellRect = shell.getBoundingClientRect();
    const centerX = shellRect.left + shellRect.width / 2;
    const centerY = shellRect.top + shellRect.height / 2;
    const startDistance = Math.max(Math.hypot(event.clientX - centerX, event.clientY - centerY), 1);
    const startWidthPx = hasExplicitBox ? shellRect.width : shell.scrollWidth || shellRect.width;
    const startHeightPx = hasExplicitBox ? shellRect.height : shell.scrollHeight || shellRect.height;
    resizeRef.current = {
      pointerId: event.pointerId,
      centerX,
      centerY,
      startDistance,
      startWidthPct: (startWidthPx / canvasRect.width) * 100,
      startHeightPct: (startHeightPx / canvasRect.height) * 100,
    };

    const moveResize = (moveEvent: PointerEvent) => {
      const startSnapshot = resizeRef.current;
      if (!startSnapshot || moveEvent.pointerId !== startSnapshot.pointerId) return;

      const distance = Math.hypot(
        moveEvent.clientX - startSnapshot.centerX,
        moveEvent.clientY - startSnapshot.centerY,
      );
      const ratio = distance / startSnapshot.startDistance;
      const widthPct = clamp(startSnapshot.startWidthPct * ratio, BOX_MIN, BOX_MAX);
      const heightPct = clamp(startSnapshot.startHeightPct * ratio, BOX_MIN, BOX_MAX);
      onChange({
        boxWidthPct: Number(widthPct.toFixed(2)),
        boxHeightPct: Number(heightPct.toFixed(2)),
      });
    };

    const endResize = (endEvent: PointerEvent) => {
      const startSnapshot = resizeRef.current;
      if (!startSnapshot || endEvent.pointerId !== startSnapshot.pointerId) return;
      cleanupRef.current();
    };

    cleanupRef.current = () => {
      window.removeEventListener('pointermove', moveResize);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
      resizeRef.current = null;
      cleanupRef.current = () => undefined;
    };

    window.addEventListener('pointermove', moveResize);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
  };

  return { shellRef, onResizePointerDown };
};
