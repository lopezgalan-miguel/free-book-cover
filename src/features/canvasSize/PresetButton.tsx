/**
 * CONTRATO · PresetButton
 * -----------------------
 * Botón de un preset de lienzo. Presentacional y controlado: no conoce el
 * store, solo pinta el preset que recibe y avisa cuando lo pulsan.
 *
 * Cómo lo hará:
 *  - El subtítulo sale de `subKey` si el preset lo trae; si no, de sus propias
 *    medidas cuando es un formato KDP. Las proporciones se identifican por su
 *    razón ("4:5"), no por píxeles, así que no muestran medidas.
 *  - El acento visual señala el preset ACTIVO, nunca el grupo al que pertenece.
 */

import { Button } from '@/sharedComponents/Button';
import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';
import type { CanvasPreset } from './presets';

export interface PresetButtonProps {
  preset: CanvasPreset;
  isActive: boolean;
  onSelect: (preset: CanvasPreset) => void;
}

/** Texto secundario del botón, o `null` si el preset no lleva subtítulo. */
const subtitleOf = (preset: CanvasPreset, t: (key: MessageKey) => string) => {
  if (preset.subKey) return t(preset.subKey);
  if (preset.group === 'kdp') return `${preset.width}×${preset.height}`;
  return null;
};

export const PresetButton = ({ preset, isActive, onSelect }: PresetButtonProps) => {
  const t = useT();
  const subtitle = subtitleOf(preset, t);

  return (
    <Button
      variant="outline"
      size="sm"
      isActive={isActive}
      onClick={() => onSelect(preset)}
      className="flex flex-col items-start gap-0.5 text-left"
    >
      <span
        className={`text-[11.5px] font-semibold ${isActive ? 'text-accent-strong' : 'text-ink-soft'}`}
      >
        {t(preset.labelKey)}
      </span>
      {subtitle && <span className="font-mono text-[9.5px] opacity-70">{subtitle}</span>}
    </Button>
  );
};
