/**
 * CONTRATO · TextBlock (bloque de texto en el preview)
 * ----------------------------------------------------
 * Renderiza UN bloque (`TextBlock` del modelo) dentro del Stage: aplica su
 * tipografía, tamaño, color, alineación, sombra, contorno y curvatura, y lo
 * posiciona por porcentaje. Es arrastrable (useDrag) y seleccionable.
 *
 * Cómo lo hace:
 *  - Recibe el bloque, el ancho en px del lienzo escalado (para traducir el
 *    tamaño de fuente en %) y si está seleccionado.
 *  - Si `curve === 0` pinta texto normal; si no, delega en core/curvedText para
 *    la geometría y lo pinta como SVG <textPath>.
 *  - No muta el store directamente: notifica selección/arrastre hacia arriba.
 *
 * El MARCO (recuadro dorado) es independiente del tamaño del texto: tiene su
 * propio ancho/alto (`boxWidthPct`/`boxHeightPct`). Mientras sea `null` se
 * auto-ajusta al texto; al redimensionar con las asas se fija el ancho (límite
 * de envoltura de línea) y el alto pasa a ser una ALTURA MÍNIMA: si el texto
 * envuelve más líneas de las que caben, el marco crece hacia abajo en vez de
 * desbordar. El texto se centra siempre (horizontal y verticalmente) dentro
 * del marco y SIEMPRE conserva su font-size (que más adelante se controlará
 * desde el panel de estilo).
 *
 * El arrastre para mover el bloque se hace agarrando el tirador superior (la
 * pestaña que aparece centrada sobre el marco al seleccionar el bloque); así
 * no interfiere con el doble clic para editar el texto.
 *
 * Componente puramente de presentación y reutilizable.
 */

import { useEffect, useRef, useState } from 'react';
import { useDrag } from './useDrag';
import { useEditorStore } from '@/store/editorStore';
import { useT } from '@/i18n/useI18n';
import { clamp } from '@/utils/clamp';
import type { TextBlock as TextBlockModel } from '@/types/editor';

/** Límites del marco en % del lienzo. */
const BOX_MIN = 2;
const BOX_MAX = 100;

export interface TextBlockProps {
  block: TextBlockModel;
  /** Ancho del lienzo escalado en pantalla, en px (para el tamaño de fuente). */
  canvasWidthPx: number;
  selected: boolean;
  /** Rectángulo del lienzo en pantalla (para el arrastre). */
  getCanvasRect: () => DOMRect | null;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const HANDLE_BY_CORNER: Record<Corner, { pos: React.CSSProperties; cursor: string }> = {
  tl: { pos: { top: -5, left: -5 }, cursor: 'nwse-resize' },
  tr: { pos: { top: -5, right: -5 }, cursor: 'nesw-resize' },
  bl: { pos: { bottom: -5, left: -5 }, cursor: 'nesw-resize' },
  br: { pos: { bottom: -5, right: -5 }, cursor: 'nwse-resize' },
};

export const TextBlock = ({ block, canvasWidthPx, selected, getCanvasRect }: TextBlockProps) => {
  const patchBlock = useEditorStore((state) => state.patchBlock);
  const selectBlock = useEditorStore((state) => state.selectBlock);
  const t = useT();
  const [editing, setEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // snapshot de inicio del redimensionado (en px del marco en pantalla)
  const resizeRef = useRef<{
    cx: number;
    cy: number;
    startDist: number;
    startWpct: number;
    startHpct: number;
    rectW: number;
    rectH: number;
  } | null>(null);

  const { isDragging, onPointerDown } = useDrag({
    getCanvasRect,
    getPosition: () => ({ x: block.x, y: block.y }),
    onChange: (position) => patchBlock(block.id, position),
  });

  useEffect(() => {
    if (editing && editableRef.current) {
      const el = editableRef.current;
      el.focus();
      // Sitúa el cursor al final del texto, sin seleccionar nada (sin resaltado azul).
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editing]);

  const fontPx = (block.fontSizePct / 100) * canvasWidthPx;

  // Sombra y contorno siguen las fórmulas del mockup (en px sobre el lienzo
  // escalado) para que el preview sea fiel a la exportación.
  const shadowFactor = block.shadowIntensity / 50;
  const shadowOff = (canvasWidthPx * 0.006 * shadowFactor).toFixed(2);
  const shadowBlur = (canvasWidthPx * 0.02 * shadowFactor + 1).toFixed(2);
  const outlinePx = ((canvasWidthPx * block.outlineWidth) / 1400).toFixed(2);

  const showFrame = selected && !editing;
  const hasExplicitBox = block.boxWidthPct != null && block.boxHeightPct != null;

  const alignItems =
    block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center';

  const shellStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${block.x}%`,
    top: `${block.y}%`,
    transform: 'translate(-50%, -50%)',
    width: hasExplicitBox ? `${block.boxWidthPct}%` : undefined,
    // Alto MÍNIMO, no fijo: si el texto envuelve más líneas, el marco crece.
    minHeight: hasExplicitBox ? `${block.boxHeightPct}%` : undefined,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems,
    cursor: isDragging ? 'grabbing' : editing ? 'text' : 'grab',
    touchAction: 'none',
    userSelect: editing ? 'text' : 'none',
    // El texto NO se recorta: si crece más que el marco, este se amplía.
    overflow: 'visible',
    WebkitTapHighlightColor: 'transparent',
  };

  const textStyle: React.CSSProperties = {
    fontFamily: `'${block.fontFamily}', Georgia, serif`,
    fontWeight: block.fontWeight,
    fontSize: `${fontPx}px`,
    fontStyle: block.italic ? 'italic' : 'normal',
    textDecoration: block.underline ? 'underline' : 'none',
    textTransform: block.uppercase ? 'uppercase' : 'none',
    color: block.color,
    letterSpacing: `${block.letterSpacing}em`,
    lineHeight: block.lineHeight,
    textAlign: block.align,
    // pre-wrap = respeta \n y además envuelve la línea al llegar al límite de
    // ancho del marco, en vez de desbordar horizontalmente.
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
    cursor: 'text',
    pointerEvents: 'auto',
    width: '100%',
    // Sin anillo de foco ni resaltado del navegador al entrar en edición.
    outline: 'none',
    caretColor: block.color,
    textShadow: block.shadow
      ? `${shadowOff}px ${shadowOff}px ${shadowBlur}px rgba(0,0,0,0.6)`
      : undefined,
    WebkitTextStroke: block.outline ? `${outlinePx}px ${block.outlineColor}` : undefined,
    paintOrder: 'stroke fill',
  };

  const beginDrag = (event: React.PointerEvent) => {
    if (editing) return;
    event.stopPropagation();
    selectBlock(block.id);
    onPointerDown(event);
  };

  const enterEdit = () => {
    if (editing) return;
    selectBlock(block.id);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const el = editableRef.current;
    if (el) {
      const raw = el.textContent ?? '';
      if (raw.trim() === '') {
        const empty = t('block.new.default');
        // Vacío tras editar: vuelve al placeholder traducible (retraducible al
        // cambiar de idioma hasta que el usuario escriba algo propio).
        if (empty !== block.text) patchBlock(block.id, { text: empty, placeholderKey: 'block.new.default' });
        el.textContent = empty;
      } else if (raw !== block.text) {
        patchBlock(block.id, { text: raw });
      }
    }
  };

  const beginResize = (event: React.PointerEvent, _corner: Corner) => {
    if (editing) return;
    event.stopPropagation();
    event.preventDefault();
    selectBlock(block.id);
    const shell = shellRef.current;
    const rect = getCanvasRect();
    if (!shell || !rect || rect.width === 0 || rect.height === 0) return;
    const r = shell.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const startDist = Math.max(Math.hypot(event.clientX - cx, event.clientY - cy), 1);
    const startWpx = hasExplicitBox ? r.width : shell.scrollWidth || r.width;
    const startHpx = hasExplicitBox ? r.height : shell.scrollHeight || r.height;
    resizeRef.current = {
      cx,
      cy,
      startDist,
      startWpct: (startWpx / rect.width) * 100,
      startHpct: (startHpx / rect.height) * 100,
      rectW: rect.width,
      rectH: rect.height,
    };

    const move = (e: PointerEvent) => {
      const ref = resizeRef.current;
      if (!ref) return;
      const dist = Math.hypot(e.clientX - ref.cx, e.clientY - ref.cy);
      const ratio = dist / ref.startDist;
      const wpct = clamp(ref.startWpct * ratio, BOX_MIN, BOX_MAX);
      const hpct = clamp(ref.startHpct * ratio, BOX_MIN, BOX_MAX);
      patchBlock(block.id, {
        boxWidthPct: Number(wpct.toFixed(2)),
        boxHeightPct: Number(hpct.toFixed(2)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={shellRef}
      style={shellStyle}
      onPointerDown={beginDrag}
      onDoubleClick={(event) => {
        event.stopPropagation();
        enterEdit();
      }}
    >
      <div
        ref={editableRef}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-multiline
        aria-label="Bloque de texto editable"
        style={textStyle}
        onBlur={commitEdit}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!editing) selectBlock(block.id);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            (event.currentTarget as HTMLElement).blur();
          }
        }}
      >
        {block.text}
      </div>

      {showFrame && (
        <>
          {/* Marco dorado de selección (no intercepta el puntero). */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              border: '1.5px solid var(--color-accent)',
              pointerEvents: 'none',
            }}
          />
          {/* Tirador superior: agárralo para mover el bloque. */}
          <div
            role="button"
            aria-label="Mover bloque de texto"
            onPointerDown={beginDrag}
            style={{
              position: 'absolute',
              top: -10,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 28,
              height: 8,
              borderRadius: 4,
              background: 'var(--color-accent)',
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              zIndex: 2,
            }}
          />
          {/* Asas de redimensionado en las esquinas */}
          {(Object.keys(HANDLE_BY_CORNER) as Corner[]).map((corner) => (
            <div
              key={corner}
              onPointerDown={(event) => beginResize(event, corner)}
              style={{
                position: 'absolute',
                zIndex: 2,
                width: 10,
                height: 10,
                background: 'var(--color-panel)',
                border: '1.5px solid var(--color-accent)',
                borderRadius: 2,
                cursor: HANDLE_BY_CORNER[corner].cursor,
                ...HANDLE_BY_CORNER[corner].pos,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
};