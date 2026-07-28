/**
 * CONTRATO · Stage (escenario del lienzo)
 * ---------------------------------------
 * Es el PREVIEW en tiempo real. Muestra el lienzo escalado para caber en
 * pantalla (manteniendo la proporción real `size`), pinta la imagen de fondo y
 * renderiza cada bloque con <TextBlock>. Refleja al instante cualquier cambio
 * del store (texto, fuente, color, estilo) — como una story de Instagram.
 *
 * Cómo lo hace:
 *  - Lee `blocks`, `image`, `size` y `selectedBlockId` del editorStore.
 *  - Calcula un factor de escala (px reales → px de pantalla) y posiciona los
 *    bloques por porcentaje, de modo que el preview sea fiel a la exportación.
 *  - Gestiona la selección (tocar un bloque lo selecciona) y el arrastre del
 *    fondo, delegando el arrastre de bloques en <TextBlock> + useDrag.
 *  - **Lienzo en blanco**: si no hay imagen, tocar el lienzo abre el selector de
 *    ficheros. Sin imagen ese gesto no tiene dueño (no hay fondo que arrastrar)
 *    y el lienzo vacío es justo donde el usuario mira cuando quiere una: se
 *    aprovecha como atajo, sin pintar ningún control nuevo encima. La subida en
 *    sí es de `useImageUpload`, la misma que usa el ImagePanel; aquí solo se
 *    dispara. El camino accesible por teclado sigue siendo el del ImagePanel.
 *  - Publica su escala con `onZoomChange` para que la cabecera pueda mostrar
 *    el % de zoom. La escala nace de medir el hueco disponible, así que solo
 *    se conoce aquí dentro; quien la quiera, la recibe.
 *
 * Responsivo: ocupa el espacio disponible y centra el lienzo. Solo preview;
 * la rasterización final es de core/renderToCanvas, no de aquí.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextBlock } from './TextBlock';
import { useDrag } from './useDrag';
import { ACCEPTED_TYPES, useImageUpload } from '@/features/image/useImageUpload';
import { useT } from '@/i18n/useI18n';
import { useEditorStore } from '@/store/editorStore';

const PADDING = 32;

/** Patrón a rayas del lienzo vacío (cuando no hay imagen de fondo). */
const PLACEHOLDER_BG =
  'repeating-linear-gradient(135deg,#3d382f 0px,#3d382f 12px,#413c33 12px,#413c33 24px)';

export interface StageProps {
  /** Recibe el zoom del preview en % entero (px de pantalla ÷ px reales). */
  onZoomChange?: (zoomPct: number) => void;
}

export const Stage = ({ onZoomChange }: StageProps) => {
  const t = useT();
  const blocks = useEditorStore((state) => state.blocks);
  const image = useEditorStore((state) => state.image);
  const size = useEditorStore((state) => state.size);
  const selectedBlockId = useEditorStore((state) => state.selectedBlockId);
  const selectBlock = useEditorStore((state) => state.selectBlock);
  const setImageOffset = useEditorStore((state) => state.setImageOffset);

  const { onFileChange, error: uploadError } = useImageUpload();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const backgroundDragged = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });
      setIsMobile(el.clientWidth < 640);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const availW = Math.max(viewport.width - PADDING * 2, 0);
  const availH = Math.max(viewport.height - PADDING * 2, 0);
  const scale =
    size.width > 0 && size.height > 0
      ? Math.min(availW / size.width, availH / size.height)
      : 0;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0;
  const canvasWidthPx = size.width * safeScale;
  const canvasHeightPx = size.height * safeScale;

  const zoomPct = Math.round(safeScale * 100);
  useEffect(() => {
    onZoomChange?.(zoomPct);
  }, [zoomPct, onZoomChange]);

  const getCanvasRect = () => canvasRef.current?.getBoundingClientRect() ?? null;

  const backgroundDrag = useDrag({
    getCanvasRect,
    getPosition: () => ({ x: 100 - (image?.offsetX ?? 50), y: 100 - (image?.offsetY ?? 50) }),
    onChange: ({ x, y }) => {
      backgroundDragged.current = true;
      setImageOffset(100 - x, 100 - y);
    },
  });

  const backgroundImage = image ? `url("${image.src}")` : undefined;
  const backgroundSize = image ? (image.fit === 'contain' ? 'contain' : 'cover') : undefined;
  const backgroundPosition = image ? `${image.offsetX}% ${image.offsetY}%` : undefined;

  return (
    <div
      ref={containerRef}
      data-stage
      className="relative flex flex-1 items-center justify-center overflow-hidden bg-stage p-8"
      onPointerDown={() => {
        backgroundDragged.current = false;
      }}
      onClick={(event) => {
        if (backgroundDragged.current) return;
        if (event.target !== containerRef.current && event.target !== canvasRef.current) return;
        selectBlock(null);
        if (!image && event.target === canvasRef.current) fileInputRef.current?.click();
      }}
    >
      {/* Patrón de puntos del escenario */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
          backgroundSize: `${isMobile ? 22 : 26}px ${isMobile ? 22 : 26}px`,
        }}
      />

      <div
        ref={canvasRef}
        className="relative flex-none overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.45)] ring-1 ring-black/10"
        onPointerDown={(event) => {
          if (event.target !== canvasRef.current) return;
          if (image) backgroundDrag.onPointerDown(event);
        }}
        style={{
          width: `${canvasWidthPx}px`,
          height: `${canvasHeightPx}px`,
          backgroundColor: image ? '#100e0b' : undefined,
          backgroundImage: image ? backgroundImage : PLACEHOLDER_BG,
          backgroundSize,
          backgroundPosition,
          backgroundRepeat: 'no-repeat',
          cursor: image ? (backgroundDrag.isDragging ? 'grabbing' : 'move') : 'pointer',
          touchAction: 'none',
        }}
      >
        {!image && safeScale > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 text-center">
            {uploadError ? (
              <span className="rounded bg-danger px-2.5 py-1.5 font-mono text-[12px] text-white">
                {t(uploadError)}
              </span>
            ) : (
              <span className="whitespace-pre-line font-mono text-[12px] tracking-[0.04em] text-white/50">
                {isMobile ? t('home.stage.placeholderMobile') : t('home.stage.placeholderDesktop')}
              </span>
            )}
          </div>
        )}

        {safeScale > 0 &&
          blocks.map((block) => (
            <TextBlock
              key={block.id}
              block={block}
              canvasWidthPx={canvasWidthPx}
              selected={block.id === selectedBlockId}
              getCanvasRect={getCanvasRect}
            />
          ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={onFileChange}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />
    </div>
  );
};