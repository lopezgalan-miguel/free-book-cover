/**
 * SizePanel (panel de tamaño de lienzo)
 * Panel izquierdo del editor (264px): gestiona la imagen de fondo, las
 * dimensiones del lienzo y las capas de texto.
 */

import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

const kdpPresets: { labelKey: MessageKey; subKey: MessageKey; w: number; h: number }[] = [
  { labelKey: 'panel.size.kindle', subKey: 'panel.size.kindleSub', w: 1600, h: 2560 },
  { labelKey: 'panel.size.paperback', subKey: 'panel.size.paperbackSub', w: 1800, h: 2700 },
  { labelKey: 'panel.size.fullCover', subKey: 'panel.size.fullCoverSub', w: 3828, h: 2775 },
  { labelKey: 'panel.size.audiobook', subKey: 'panel.size.audiobookSub', w: 2400, h: 2400 },
];

const ratioPresets: { labelKey: MessageKey; subKey: MessageKey | null }[] = [
  { labelKey: 'panel.size.ratio23', subKey: 'panel.size.ratio23Sub' },
  { labelKey: 'panel.size.ratio45', subKey: null },
  { labelKey: 'panel.size.ratio11', subKey: null },
  { labelKey: 'panel.size.ratio916', subKey: 'panel.size.ratio916Sub' },
  { labelKey: 'panel.size.ratio43', subKey: null },
  { labelKey: 'panel.size.ratio169', subKey: null },
];

const layerSamples = [
  { text: 'El Título de tu Obra', font: 'Playfair Display' },
  { text: 'un subtítulo evocador', font: 'Cormorant Garamond' },
  { text: 'NOMBRE DEL AUTOR', font: 'Montserrat' },
];

export const SizePanel = () => {
  const t = useT();

  return (
    <section data-panel="size" className="flex flex-col gap-0">
      <div className="border-b border-line-soft p-4">
        <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.size.backgroundImage')}
        </p>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-panel px-3 py-2.5 hover:border-accent-strong hover:bg-white">
          <div className="h-[52px] w-[38px] flex-none rounded bg-stage-dark" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{t('panel.size.uploadImage')}</p>
            <p className="text-[10.5px] text-muted">{t('panel.size.formats')}</p>
          </div>
          <input type="file" accept="image/*" className="hidden" />
        </label>
      </div>

      <div className="border-b border-line-soft p-4">
        <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.size.canvas')}
        </p>

        <div className="mb-3">
          <p className="mb-1.5 text-xs text-ink-soft">{t('panel.size.amazonKdp')}</p>
          <div className="flex flex-wrap gap-1.5">
            {kdpPresets.map((preset) => (
              <button
                key={preset.labelKey}
                className="flex flex-col items-start gap-0.5 rounded-lg border border-accent bg-accent-tint px-2 py-1.5 text-left"
              >
                <span className="text-[11.5px] font-semibold text-accent-strong">{t(preset.labelKey)}</span>
                <span className="font-mono text-[9.5px] opacity-70">{t(preset.subKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-xs text-ink-soft">{t('panel.size.proportion')}</p>
          <div className="flex flex-wrap gap-1.5">
            {ratioPresets.map((preset) => (
              <button
                key={preset.labelKey}
                className="flex flex-col items-start gap-0.5 rounded-lg border border-line bg-white px-2 py-1.5 text-left"
              >
                <span className="text-[11.5px] font-semibold text-ink-soft">{t(preset.labelKey)}</span>
                {preset.subKey && (
                  <span className="font-mono text-[9.5px] opacity-70">{t(preset.subKey)}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <p className="mb-1 text-[10px] text-muted">{t('panel.size.width')}</p>
            <input
              type="number"
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 font-mono text-sm text-ink"
            />
          </div>
          <div className="flex items-end pb-2 text-line">×</div>
          <div className="flex-1">
            <p className="mb-1 text-[10px] text-muted">{t('panel.size.height')}</p>
            <input
              type="number"
              className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 font-mono text-sm text-ink"
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            {t('panel.size.textLayers')}
          </p>
          <button className="flex h-6 w-6 items-center justify-center rounded border border-line bg-white text-base leading-none text-accent">
            +
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {layerSamples.map((layer, idx) => (
            <div
              key={idx}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-accent bg-accent-tint px-2 py-2"
            >
              <span className="flex-none text-xl leading-none text-ink" style={{ fontFamily: layer.font }}>Aa</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-ink">{layer.text}</p>
                <p className="truncate text-[10px] text-muted">{layer.font}</p>
              </div>
              <button className="flex-none border-none bg-transparent p-1 text-lg leading-none text-muted hover:text-danger">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
