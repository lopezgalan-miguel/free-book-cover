/**
 * CONTRATO · SizeInputs
 * ---------------------
 * Ancho y alto del lienzo en píxeles. Es la vía para escribir una medida a
 * mano, complementaria a los presets.
 *
 * Cómo lo hará:
 *  - Trabaja sobre un borrador local mientras se teclea, para que el campo se
 *    pueda vaciar y reescribir sin que el lienzo colapse a cada pulsación.
 *  - Confirma al salir del campo o con Enter, acotando a [100, 10000]. Un valor
 *    ilegible (campo vacío, texto) revierte a la medida vigente.
 *  - Confirmar un cambio deja el preset en 'custom' (lo hace `setSize`), así que
 *    el botón que estuviera acentuado se apaga solo.
 *  - Si el tamaño cambia desde fuera (al pulsar un preset), el borrador se
 *    resincroniza.
 */

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { useEditorStore } from '@/store/editorStore';
import { clamp } from '@/utils/clamp';

/** Límites de lienzo admitidos, en píxeles. */
const MIN_PX = 100;
const MAX_PX = 10000;

/** Eje editable: coincide con las claves de `CanvasSize`. */
type Axis = 'width' | 'height';

interface PxFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

/** Un campo numérico etiquetado. Presentacional: el borrador lo lleva el padre. */
const PxField = ({ label, value, onChange, onCommit }: PxFieldProps) => (
  <div className="flex-1">
    <p className="mb-1 text-[10px] text-muted">{label}</p>
    <input
      type="number"
      min={MIN_PX}
      max={MAX_PX}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        // Enter confirma saliendo del campo: el commit lo dispara `onBlur`.
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 font-mono text-sm text-ink"
    />
  </div>
);

export const SizeInputs = () => {
  const t = useT();
  const size = useEditorStore((state) => state.size);
  const setSize = useEditorStore((state) => state.setSize);
  const [draft, setDraft] = useState<Record<Axis, string>>({
    width: String(size.width),
    height: String(size.height),
  });

  useEffect(() => {
    setDraft({ width: String(size.width), height: String(size.height) });
  }, [size.width, size.height]);

  const commit = (axis: Axis) => {
    const parsed = Number.parseInt(draft[axis], 10);
    const value = Number.isNaN(parsed) ? size[axis] : clamp(parsed, MIN_PX, MAX_PX);

    setDraft((current) => ({ ...current, [axis]: String(value) }));
    if (value !== size[axis]) setSize({ ...size, [axis]: value });
  };

  const editAxis = (axis: Axis) => (value: string) =>
    setDraft((current) => ({ ...current, [axis]: value }));

  return (
    <div className="flex gap-2">
      <PxField
        label={t('panel.size.width')}
        value={draft.width}
        onChange={editAxis('width')}
        onCommit={() => commit('width')}
      />
      <div className="flex items-end pb-2 text-line">×</div>
      <PxField
        label={t('panel.size.height')}
        value={draft.height}
        onChange={editAxis('height')}
        onCommit={() => commit('height')}
      />
    </div>
  );
};
