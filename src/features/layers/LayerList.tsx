/**
 * CONTRATO · LayerList (lista de capas de texto)
 * ----------------------------------------------
 * Muestra los bloques de texto del proyecto y permite añadir, seleccionar y
 * eliminar capas. Es el índice del documento: lo que está seleccionado aquí es
 * lo que editan `TextPanel`, `StylePanel`, `FontPanel` y `ColorPanel`.
 *
 * Cómo lo hace:
 *  - Lee `blocks` y `selectedBlockId` del store; no guarda estado propio.
 *  - `layout` solo cambia el contenedor: `'column'` es la lista vertical de
 *    escritorio y `'row'` la tira con scroll horizontal de móvil. El contenido
 *    de cada fila es el mismo en ambos.
 *  - Seleccionar y eliminar son dos botones HERMANOS: anidar un botón dentro de
 *    otro es HTML inválido.
 *  - Incluye su propia cabecera (título + añadir): quien la monta solo la
 *    coloca, no compone sus partes.
 */

import { fontStackOf } from '@/features/fonts/catalog';
import { useT } from '@/i18n/useI18n';
import { Button } from '@/sharedComponents/Button';
import { useEditorStore } from '@/store/editorStore';

export interface LayerListProps {
  layout: 'column' | 'row';
}

const CONTAINER_CLASS: Record<LayerListProps['layout'], string> = {
  column: 'flex flex-col gap-1.5',
  row: 'flex gap-1.5 overflow-x-auto',
};

const ROW_CLASS: Record<LayerListProps['layout'], string> = {
  column: 'flex items-center gap-1',
  row: 'flex w-[168px] flex-none items-center gap-1',
};

export const LayerList = ({ layout }: LayerListProps) => {
  const t = useT();
  const blocks = useEditorStore((state) => state.blocks);
  const selectedBlockId = useEditorStore((state) => state.selectedBlockId);
  const selectBlock = useEditorStore((state) => state.selectBlock);
  const removeBlock = useEditorStore((state) => state.removeBlock);
  const addBlock = useEditorStore((state) => state.addBlock);

  return (
    <section data-panel="layers" className="p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.size.textLayers')}
        </p>
        <Button
          size="iconSm"
          onClick={addBlock}
          aria-label={t('panel.size.addLayer')}
          className="text-base leading-none text-accent"
        >
          +
        </Button>
      </div>

      <div className={CONTAINER_CLASS[layout]}>
        {blocks.map((block) => {
          const isActive = block.id === selectedBlockId;
          return (
            <div key={block.id} className={ROW_CLASS[layout]}>
              <Button
                size="sm"
                isActive={isActive}
                onClick={() => selectBlock(block.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className="flex-none text-xl leading-none text-ink"
                  style={{ fontFamily: fontStackOf(block.fontFamily) }}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs ${
                      isActive ? 'text-accent-strong' : 'text-ink'
                    }`}
                  >
                    {block.text}
                  </span>
                  <span className="block truncate text-[10px] text-muted">
                    {block.fontFamily}
                  </span>
                </span>
              </Button>
              <Button
                variant="danger"
                size="none"
                onClick={() => removeBlock(block.id)}
                aria-label={t('panel.layers.remove')}
                className="flex-none p-1 text-lg leading-none"
              >
                ×
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
