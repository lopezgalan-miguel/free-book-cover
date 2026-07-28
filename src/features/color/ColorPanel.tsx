/**
 * CONTRATO · ColorPanel (color del texto)
 * ---------------------------------------
 * Da color al bloque seleccionado por tres vías equivalentes: el selector
 * nativo, el código hexadecimal escrito a mano y la paleta de muestras.
 *
 * Cómo lo hace:
 *  - Todo color entra por `normalizeHex` antes de tocar el store: el modelo
 *    solo guarda `#RRGGBB` en mayúsculas. Lo que no valida, no se escribe.
 *  - El campo hexadecimal guarda un BORRADOR local mientras se teclea: hasta
 *    completar los seis dígitos el texto no es un color válido, y sin borrador
 *    el campo se vaciaría a cada pulsación. Al salir del campo, un borrador
 *    inválido se descarta y vuelve el color real del bloque.
 *  - El borrador se resincroniza cuando el color cambia desde fuera (otra capa
 *    seleccionada, una muestra de la paleta o el selector nativo).
 *  - Sin selección no se pinta nada: el estado vacío lo resuelve `Home`.
 */

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/useI18n';
import { useSelectedBlock } from '@/features/text/useSelectedBlock';
import { useEditorStore } from '@/store/editorStore';
import { normalizeHex } from '@/utils/hex';

/** Paleta del mockup: neutros de portada, dos acentos cálidos y uno frío. */
const SWATCHES = [
  '#FFFFFF',
  '#F4EFE6',
  '#C2B6A1',
  '#8C6F47',
  '#2B2824',
  '#1A1712',
  '#B4453A',
  '#3E5C4B',
];

/** Quita la almohadilla: el campo de texto la lleva fuera, como prefijo fijo. */
const toDigits = (hex: string) => hex.replace('#', '');

export const ColorPanel = () => {
  const t = useT();
  const block = useSelectedBlock();
  const patchSelected = useEditorStore((state) => state.patchSelected);

  const color = block?.color ?? null;
  const [hexDraft, setHexDraft] = useState(() => (color ? toDigits(color) : ''));

  useEffect(() => {
    if (color) setHexDraft(toDigits(color));
  }, [color]);

  if (!block) return null;

  const setColor = (input: string) => {
    const normalized = normalizeHex(input);
    if (normalized) patchSelected({ color: normalized });
  };

  const onHexInput = (raw: string) => {
    setHexDraft(raw.toUpperCase());
    setColor(raw);
  };

  /** Al salir del campo, un borrador a medias o inválido no deja rastro. */
  const onHexBlur = () => {
    if (!normalizeHex(hexDraft)) setHexDraft(toDigits(block.color));
  };

  return (
    <section data-panel="color" className="flex flex-col gap-0">
      <div className="p-4">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.color.title')}
        </p>

        <div className="mb-3 flex items-center gap-2.5">
          <input
            type="color"
            value={block.color}
            onChange={(event) => setColor(event.target.value)}
            aria-label={t('panel.color.title')}
            className="h-10 w-11 cursor-pointer rounded-lg border border-line bg-white p-1"
          />
          <div className="flex flex-1 items-center rounded-lg border border-line bg-white px-2.5">
            <span aria-hidden="true" className="font-mono text-sm text-muted">
              #
            </span>
            <input
              type="text"
              maxLength={6}
              value={hexDraft}
              onChange={(event) => onHexInput(event.target.value)}
              onBlur={onHexBlur}
              placeholder={t('panel.color.hexPlaceholder')}
              aria-label={t('panel.color.title')}
              className="flex-1 border-none bg-transparent px-1.5 py-2.5 font-mono text-sm uppercase text-ink outline-none"
            />
          </div>
        </div>

        <div className="flex gap-1.5">
          {SWATCHES.map((hex) => {
            const isActive = hex === block.color;
            return (
              <button
                key={hex}
                type="button"
                title={hex}
                aria-label={hex}
                aria-pressed={isActive}
                onClick={() => setColor(hex)}
                className={`h-6 flex-1 cursor-pointer rounded border border-black/10 ${
                  isActive ? 'ring-2 ring-accent-strong ring-offset-1' : ''
                }`}
                style={{ backgroundColor: hex }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};
