/**
 * CONTRATO · StylePanel (estilo del bloque)
 * -----------------------------------------
 * Todo lo que no es el texto en sí del bloque seleccionado: peso, negrita,
 * cursiva, subrayado, mayúsculas, alineación, tamaño, interlineado, espaciado
 * y efectos (sombra, contorno, curvatura).
 *
 * Cómo lo hace:
 *  - Cada control es controlado y escribe en el store con `patchSelected`: no
 *    hay estado intermedio, el `Stage` refleja el cambio al instante.
 *  - Los ajustes finos de un efecto (intensidad de sombra, grosor y color del
 *    contorno) solo aparecen cuando el efecto está activo.
 *  - Los nombres de peso ("Regular", "Bold"…) NO se traducen: son los valores
 *    CSS del grosor, terminología tipográfica, igual que el nombre de la
 *    familia. Lo traducible es la etiqueta del control, no el valor.
 *  - Sin selección no se pinta nada: el estado vacío lo resuelve `Home`.
 */

import { useT } from '@/i18n/useI18n';
import { Button } from '@/sharedComponents/Button';
import { Slider } from '@/sharedComponents/Slider';
import { Toggle } from '@/sharedComponents/Toggle';
import { useEditorStore } from '@/store/editorStore';
import type { TextAlign } from '@/types/editor';
import { normalizeHex } from '@/utils/hex';
import { useSelectedBlock } from './useSelectedBlock';
import type { MessageKey } from '@/i18n/messages';

const WEIGHTS = [
  { value: 300, label: 'Light 300' },
  { value: 400, label: 'Regular 400' },
  { value: 500, label: 'Medium 500' },
  { value: 600, label: 'Semibold 600' },
  { value: 700, label: 'Bold 700' },
  { value: 800, label: 'Extrabold 800' },
];

const ALIGNMENTS: { value: TextAlign; icon: string; labelKey: MessageKey }[] = [
  { value: 'left', icon: '⇤', labelKey: 'panel.style.alignLeft' },
  { value: 'center', icon: '⇔', labelKey: 'panel.style.alignCenter' },
  { value: 'right', icon: '⇥', labelKey: 'panel.style.alignRight' },
];

/** Clases del cuadradito de estilo: el color lo decide su estado. */
const markClass = (isActive: boolean, extra = '') =>
  `${extra} text-sm ${isActive ? 'text-accent-strong' : 'text-ink-soft'}`;

export const StylePanel = () => {
  const t = useT();
  const block = useSelectedBlock();
  const patchSelected = useEditorStore((state) => state.patchSelected);

  if (!block) return null;

  const isBold = block.fontWeight >= 700;

  const setOutlineColor = (input: string) => {
    const color = normalizeHex(input);
    if (color) patchSelected({ outlineColor: color });
  };

  return (
    <section data-panel="style" className="flex flex-col gap-0">
      <div className="border-b border-line-soft p-4">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.text.style')}
        </p>

        <select
          value={block.fontWeight}
          onChange={(event) => patchSelected({ fontWeight: Number(event.target.value) })}
          aria-label={t('panel.text.weight')}
          className="mb-3 flex w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink"
        >
          {WEIGHTS.map((weight) => (
            <option key={weight.value} value={weight.value}>
              {weight.label}
            </option>
          ))}
        </select>

        <div className="mb-3 flex gap-1.5">
          <Button
            size="icon"
            isActive={isBold}
            onClick={() => patchSelected({ fontWeight: isBold ? 400 : 700 })}
            aria-label={t('panel.style.bold')}
            className={markClass(isBold, 'font-bold')}
          >
            B
          </Button>
          <Button
            size="icon"
            isActive={block.italic}
            onClick={() => patchSelected({ italic: !block.italic })}
            aria-label={t('panel.style.italic')}
            className={markClass(block.italic, 'italic')}
          >
            I
          </Button>
          <Button
            size="icon"
            isActive={block.underline}
            onClick={() => patchSelected({ underline: !block.underline })}
            aria-label={t('panel.style.underline')}
            className={markClass(block.underline, 'underline')}
          >
            U
          </Button>
          <Button
            size="icon"
            isActive={block.uppercase}
            onClick={() => patchSelected({ uppercase: !block.uppercase })}
            aria-label={t('panel.style.uppercase')}
            className={`tracking-wide ${
              block.uppercase ? 'text-accent-strong' : 'text-ink-soft'
            } text-[11px]`}
          >
            AA
          </Button>
          <div className="flex-1" />
          {ALIGNMENTS.map((alignment) => (
            <Button
              key={alignment.value}
              size="icon"
              isActive={block.align === alignment.value}
              onClick={() => patchSelected({ align: alignment.value })}
              aria-label={t(alignment.labelKey)}
              className={markClass(block.align === alignment.value)}
            >
              {alignment.icon}
            </Button>
          ))}
        </div>

        <div className="mb-3">
          <Slider
            label={t('panel.text.size')}
            value={block.fontSizePct}
            min={2}
            max={26}
            step={0.5}
            valueLabel={`${block.fontSizePct.toFixed(1)}%`}
            onChange={(value) => patchSelected({ fontSizePct: value })}
          />
        </div>

        <div className="mb-3">
          <Slider
            label={t('panel.text.lineHeight')}
            value={block.lineHeight}
            min={0.8}
            max={2.4}
            step={0.05}
            valueLabel={block.lineHeight.toFixed(2)}
            onChange={(value) => patchSelected({ lineHeight: value })}
          />
        </div>

        <Slider
          label={t('panel.text.letterSpacing')}
          value={block.letterSpacing}
          min={-0.05}
          max={0.5}
          step={0.01}
          valueLabel={`${block.letterSpacing.toFixed(2)}em`}
          onChange={(value) => patchSelected({ letterSpacing: value })}
        />
      </div>

      <div className="p-4">
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.text.effects')}
        </p>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-ink">{t('panel.text.shadow')}</span>
          <Toggle
            label={t('panel.text.shadow')}
            checked={block.shadow}
            onChange={(checked) => patchSelected({ shadow: checked })}
          />
        </div>

        {block.shadow && (
          <div className="mb-3">
            <Slider
              label={t('panel.style.shadowIntensity')}
              value={block.shadowIntensity}
              min={0}
              max={100}
              step={1}
              onChange={(value) => patchSelected({ shadowIntensity: value })}
            />
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-ink">{t('panel.text.outline')}</span>
          <Toggle
            label={t('panel.text.outline')}
            checked={block.outline}
            onChange={(checked) => patchSelected({ outline: checked })}
          />
        </div>

        {block.outline && (
          <>
            <div className="mb-3">
              <Slider
                label={t('panel.style.outlineWidth')}
                value={block.outlineWidth}
                min={1}
                max={20}
                step={1}
                onChange={(value) => patchSelected({ outlineWidth: value })}
              />
            </div>

            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-ink-soft">{t('panel.style.outlineColor')}</span>
              <input
                type="color"
                value={block.outlineColor}
                onChange={(event) => setOutlineColor(event.target.value)}
                aria-label={t('panel.style.outlineColor')}
                className="h-7 w-10 cursor-pointer rounded border border-line bg-white p-0.5"
              />
            </div>
          </>
        )}

        <Slider
          label={t('panel.text.curvature')}
          value={block.curve}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => patchSelected({ curve: value })}
        />
      </div>
    </section>
  );
};
