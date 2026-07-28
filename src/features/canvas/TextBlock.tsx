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
 * El RELLENO del texto es o el color o la textura, nunca los dos. Con textura
 * puesta, el texto editable se queda con el relleno transparente (conserva
 * contorno y sombra, que se dibujan sobre la geometría del glifo) y encima se
 * pinta una copia no interactiva con `background-clip: text`. La OPACIDAD vive
 * en esa copia, no en el elemento entero: aplicada arriba apagaría también el
 * contorno y la sombra.
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
 * Fuera del modo edición se puede arrastrar desde todo el bloque. El umbral de
 * `useDrag` preserva el doble clic para editar.
 *
 * La edición, el resize y los estilos calculados viven en módulos dedicados;
 * este componente coordina sus eventos y compone el resultado visual.
 */

import { CurvedTextView } from './CurvedTextView';
import { getTextBlockPresentation } from './textBlockPresentation';
import { useDrag } from './useDrag';
import { useTextBlockEditing } from './useTextBlockEditing';
import { useTextBlockResize } from './useTextBlockResize';
import { useEditorStore } from '@/store/editorStore';
import type { TextBlock as TextBlockModel } from '@/types/editor';

export interface TextBlockProps {
  block: TextBlockModel;
  canvasWidthPx: number;
  selected: boolean;
  getCanvasRect: () => DOMRect | null;
}

const RESIZE_HANDLES = [
  { id: 'tl', position: { top: -5, left: -5 }, cursor: 'nwse-resize' },
  { id: 'tr', position: { top: -5, right: -5 }, cursor: 'nesw-resize' },
  { id: 'bl', position: { bottom: -5, left: -5 }, cursor: 'nesw-resize' },
  { id: 'br', position: { bottom: -5, right: -5 }, cursor: 'nwse-resize' },
] satisfies ReadonlyArray<{
  id: string;
  position: React.CSSProperties;
  cursor: React.CSSProperties['cursor'];
}>;

export const TextBlock = ({ block, canvasWidthPx, selected, getCanvasRect }: TextBlockProps) => {
  const patchBlock = useEditorStore((state) => state.patchBlock);
  const selectBlock = useEditorStore((state) => state.selectBlock);
  const selectCurrentBlock = () => selectBlock(block.id);
  const patchCurrentBlock = (patch: Partial<TextBlockModel>) => patchBlock(block.id, patch);

  const { editing, editableRef, onDoubleClick, onBlur, onKeyDown } = useTextBlockEditing({
    block,
    onSelect: selectCurrentBlock,
    onChange: patchCurrentBlock,
  });

  const hasExplicitBox = block.boxWidthPct != null && block.boxHeightPct != null;
  const { shellRef, onResizePointerDown } = useTextBlockResize({
    disabled: editing,
    hasExplicitBox,
    getCanvasRect,
    onSelect: selectCurrentBlock,
    onChange: patchCurrentBlock,
  });

  const { isDragging, onPointerDown } = useDrag({
    getCanvasRect,
    getPosition: () => ({ x: block.x, y: block.y }),
    onChange: patchCurrentBlock,
  });

  const showFrame = selected;
  const showControls = selected && !editing;
  const { curved, fontSizePx, shellStyle, textStyle, textureLayerStyle } =
    getTextBlockPresentation({ block, canvasWidthPx, editing, isDragging });

  const beginDrag = (event: React.PointerEvent) => {
    if (editing) return;
    event.stopPropagation();
    selectCurrentBlock();
    onPointerDown(event);
  };

  return (
    <div
      ref={shellRef}
      style={shellStyle}
      onPointerDown={beginDrag}
      onDoubleClick={onDoubleClick}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        {curved ? (
          <CurvedTextView block={block} canvasWidthPx={canvasWidthPx} fontSizePx={fontSizePx} />
        ) : (
          <>
            <div
              ref={editableRef}
              contentEditable={editing}
              suppressContentEditableWarning
              spellCheck={false}
              role="textbox"
              aria-multiline
              aria-label="Bloque de texto editable"
              style={textStyle}
              onBlur={onBlur}
              onPointerDown={(event) => {
                if (editing) {
                  event.stopPropagation();
                  return;
                }
                beginDrag(event);
              }}
              onKeyDown={onKeyDown}
            >
              {block.text}
            </div>

            {textureLayerStyle && (
              <div aria-hidden="true" style={textureLayerStyle}>
                {block.text}
              </div>
            )}
          </>
        )}
      </div>

      {showFrame && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            border: '1.5px solid var(--color-accent)',
            pointerEvents: 'none',
          }}
        />
      )}

      {showControls &&
        RESIZE_HANDLES.map((handle) => (
          <div
            key={handle.id}
            onPointerDown={onResizePointerDown}
            style={{
              position: 'absolute',
              zIndex: 2,
              width: 10,
              height: 10,
              background: 'var(--color-panel)',
              border: '1.5px solid var(--color-accent)',
              borderRadius: 2,
              cursor: handle.cursor,
              ...handle.position,
            }}
          />
        ))}
    </div>
  );
};
