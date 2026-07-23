/**
 * TextPanel (panel de texto y estilo)
 * Edita el contenido y el estilo del bloque seleccionado: textarea,
 * controles de estilo (weight, B/I/U/AA, align), sliders (tamaño, interlineado,
 * espaciado) y efectos (sombra, contorno, curvatura).
 */

import { useT } from '@/i18n/useI18n';

const hasSelection = true;

const weights = [
  { value: 300, label: 'Light 300' },
  { value: 400, label: 'Regular 400' },
  { value: 500, label: 'Medium 500' },
  { value: 600, label: 'Semibold 600' },
  { value: 700, label: 'Bold 700' },
  { value: 800, label: 'Extrabold 800' },
];

export const TextPanel = () => {
  const t = useT();

  if (!hasSelection) {
    return (
      <div className="p-10 text-center text-sm text-muted leading-relaxed">
        {t('panel.text.noSelection')}
      </div>
    );
  }

  return (
    <section data-panel="text" className="flex flex-col gap-0">
      <div className="border-b border-line-soft p-4">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.text.title')}
        </p>
        <textarea
          rows={2}
          placeholder={t('panel.text.placeholder')}
          className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm leading-relaxed text-ink"
        />
      </div>

      <div className="border-b border-line-soft p-4">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.text.style')}
        </p>

        <select className="mb-3 flex w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink">
          {weights.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>

        <div className="mb-3 flex gap-1.5">
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent bg-accent-tint text-sm font-bold text-accent-strong">
            B
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-sm italic text-ink-soft">
            I
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-sm text-ink-soft">
            U
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-[11px] tracking-wide text-ink-soft">
            AA
          </button>
          <div className="flex-1" />
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-sm text-ink-soft">
            ⇤
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent bg-accent-tint text-sm text-accent-strong">
            ⇔
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-sm text-ink-soft">
            ⇥
          </button>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
            <span>{t('panel.text.size')}</span>
            <span className="font-mono text-[11px] text-muted">11.0%</span>
          </div>
          <input
            type="range"
            min={2}
            max={26}
            step={0.5}
            defaultValue={11}
            className="mb-3 h-2 w-full cursor-pointer rounded-lg bg-line accent-accent"
          />
        </div>

        <div className="mb-3">
          <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
            <span>{t('panel.text.lineHeight')}</span>
            <span className="font-mono text-[11px] text-muted">1.02</span>
          </div>
          <input
            type="range"
            min={0.8}
            max={2.4}
            step={0.05}
            defaultValue={1.02}
            className="mb-3 h-2 w-full cursor-pointer rounded-lg bg-line accent-accent"
          />
        </div>

        <div>
          <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
            <span>{t('panel.text.letterSpacing')}</span>
            <span className="font-mono text-[11px] text-muted">0.00em</span>
          </div>
          <input
            type="range"
            min={-0.05}
            max={0.5}
            step={0.01}
            defaultValue={0}
            className="h-2 w-full cursor-pointer rounded-lg bg-line accent-accent"
          />
        </div>
      </div>

      <div className="p-4">
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.text.effects')}
        </p>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-ink">{t('panel.text.shadow')}</span>
          <button className="relative h-5 w-9 rounded-full border-none bg-line cursor-pointer">
            <span className="absolute left-1 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-ink">{t('panel.text.outline')}</span>
          <button className="relative h-5 w-9 rounded-full border-none bg-accent cursor-pointer">
            <span className="absolute left-[18px] top-0.5 h-4 w-4 rounded-full bg-white shadow-sm" />
          </button>
        </div>

        <div>
          <div className="mb-1.5 flex justify-between text-sm text-ink">
            <span>{t('panel.text.curvature')}</span>
            <span className="font-mono text-[11px] text-muted">0</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            defaultValue={0}
            className="h-2 w-full cursor-pointer rounded-lg bg-line accent-accent"
          />
        </div>
      </div>
    </section>
  );
};
