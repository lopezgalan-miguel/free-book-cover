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
 *
 * Responsivo: ocupa el espacio disponible y centra el lienzo. Solo preview;
 * la rasterización final es de core/renderToCanvas, no de aquí.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { TextBlock } from './TextBlock';
import { useT } from '@/i18n/useI18n';
import { useEditorStore } from '@/store/editorStore';

const PADDING = 32;

/** Patrón a rayas del lienzo vacío (cuando no hay imagen de fondo). */
const PLACEHOLDER_BG =
  'repeating-linear-gradient(135deg,#3d382f 0px,#3d382f 12px,#413c33 12px,#413c33 24px)';

export const Stage = () => {
  const t = useT();
  const blocks = useEditorStore((state) => state.blocks);
  const image = useEditorStore((state) => state.image);
  const size = useEditorStore((state) => state.size);
  const selectedBlockId = useEditorStore((state) => state.selectedBlockId);
  const selectBlock = useEditorStore((state) => state.selectBlock);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(false);

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

  const getCanvasRect = () => canvasRef.current?.getBoundingClientRect() ?? null;

  const backgroundImage = image ? `url("${image.src}")` : undefined;
  const backgroundSize = image ? (image.fit === 'contain' ? 'contain' : 'cover') : undefined;
  const backgroundPosition = image ? `${image.offsetX}% ${image.offsetY}%` : undefined;

  return (
    <div
      ref={containerRef}
      data-stage
      className="relative flex flex-1 items-center justify-center overflow-hidden bg-stage p-8"
      onPointerDown={(event) => {
        if (event.target === containerRef.current || event.target === canvasRef.current) {
          selectBlock(null);
        }
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
        style={{
          width: `${canvasWidthPx}px`,
          height: `${canvasHeightPx}px`,
          backgroundColor: image ? '#100e0b' : undefined,
          backgroundImage: image ? backgroundImage : PLACEHOLDER_BG,
          backgroundSize,
          backgroundPosition,
          backgroundRepeat: 'no-repeat',
          cursor: image ? 'move' : 'default',
          touchAction: 'none',
        }}
      >
        {!image && safeScale > 0 && (
          <div className="absolute inset-0 flex items-center justify-center px-5 text-center">
            <span className="whitespace-pre-line font-mono text-[12px] tracking-[0.04em] text-white/50">
              {isMobile ? t('home.stage.placeholderMobile') : t('home.stage.placeholderDesktop')}
            </span>
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
    </div>
  );
};