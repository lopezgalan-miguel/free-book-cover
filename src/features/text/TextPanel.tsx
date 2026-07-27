/**
 * CONTRATO · TextPanel (contenido del bloque)
 * -------------------------------------------
 * Edita el TEXTO del bloque seleccionado, y nada más: el estilo (peso, B/I/U,
 * alineación, tamaño, efectos) es de `StylePanel`.
 *
 * Cómo lo hace:
 *  - El textarea es controlado: escribe en el store con `patchSelected` en cada
 *    pulsación, así el `Stage` se actualiza en vivo.
 *  - Escribir aquí cuenta como edición manual: el store limpia el
 *    `placeholderKey` del bloque y deja de retraducirlo al cambiar de idioma.
 *  - Sin selección no se pinta nada: el estado vacío es cosa de `Home`, que
 *    sustituye el panel derecho entero.
 */

import { useT } from '@/i18n/useI18n';
import { useEditorStore } from '@/store/editorStore';
import { useSelectedBlock } from './useSelectedBlock';

export const TextPanel = () => {
  const t = useT();
  const block = useSelectedBlock();
  const patchSelected = useEditorStore((state) => state.patchSelected);

  if (!block) return null;

  return (
    <section data-panel="text" className="p-4">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
        {t('panel.text.title')}
      </p>
      <textarea
        rows={2}
        value={block.text}
        onChange={(event) => patchSelected({ text: event.target.value })}
        placeholder={t('panel.text.placeholder')}
        aria-label={t('panel.text.title')}
        className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm leading-relaxed text-ink"
      />
    </section>
  );
};
