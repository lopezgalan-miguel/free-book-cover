/**
 * CONTRATO · PresetGroup
 * ----------------------
 * Una sección de presets del panel de tamaño: su título y la rejilla de
 * botones. Es el único punto que conecta el catálogo con el store.
 *
 * Cómo lo hará:
 *  - Filtra `CANVAS_PRESETS` por grupo, así que añadir un preset al catálogo
 *    lo hace aparecer aquí sin tocar este componente.
 *  - Marca como activo el preset cuyo `id` coincide con `activePresetId`.
 *  - Al pulsar aplica las medidas del preset con `setSize`, que además deja
 *    registrado cuál quedó activo.
 */

import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { useEditorStore } from '@/store/editorStore';
import { CANVAS_PRESETS, type PresetGroupId } from './presets';
import { PresetButton } from './PresetButton';

/** Título de cada sección; el catálogo no conoce las etiquetas de la interfaz. */
const GROUP_TITLE_KEY: Record<PresetGroupId, MessageKey> = {
  kdp: 'panel.size.amazonKdp',
  ratio: 'panel.size.proportion',
};

export interface PresetGroupProps {
  group: PresetGroupId;
}

export const PresetGroup = ({ group }: PresetGroupProps) => {
  const t = useT();
  const activePresetId = useEditorStore((state) => state.activePresetId);
  const setSize = useEditorStore((state) => state.setSize);
  const presets = CANVAS_PRESETS.filter((preset) => preset.group === group);

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs text-ink-soft">{t(GROUP_TITLE_KEY[group])}</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <PresetButton
            key={preset.id}
            preset={preset}
            isActive={preset.id === activePresetId}
            onSelect={({ id, width, height }) => setSize({ width, height }, id)}
          />
        ))}
      </div>
    </div>
  );
};
