/**
 * FontPanel (panel de fuentes)
 * Lista las familias disponibles agrupadas (Serif, Sans serif, Display,
 * Sistema) mostrando cada nombre con su propia tipografía como muestra.
 */

import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

export const fontGroups: { groupKey: MessageKey; fonts: string[]; stack: string }[] = [
  {
    groupKey: 'panel.font.group.serif',
    fonts: ['Playfair Display', 'Cormorant Garamond', 'EB Garamond', 'Libre Baskerville', 'Lora', 'Spectral', 'Marcellus'],
    stack: 'serif',
  },
  {
    groupKey: 'panel.font.group.sansSerif',
    fonts: ['Montserrat', 'Josefin Sans', 'Archivo'],
    stack: 'sans-serif',
  },
  {
    groupKey: 'panel.font.group.display',
    fonts: ['Bebas Neue', 'Oswald', 'Cinzel'],
    stack: 'sans-serif',
  },
  {
    groupKey: 'panel.font.group.system',
    fonts: ['Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana'],
    stack: 'sans-serif',
  },
];

const activeFont = 'Playfair Display';

export const FontPanel = () => {
  const t = useT();

  return (
    <section data-panel="fonts" className="flex flex-col gap-0">
      <div className="border-b border-line-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            {t('panel.font.title')}
          </p>
          <label className="cursor-pointer text-sm font-medium text-accent hover:text-accent-strong">
            {t('panel.font.upload')}
            <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" />
          </label>
        </div>

        <div className="max-h-[186px] overflow-y-auto rounded-lg border border-line-soft bg-white p-1.5">
          {fontGroups.map((group) => (
            <div key={group.groupKey}>
              <p className="px-2 py-2 text-[9.5px] uppercase tracking-wider text-muted">
                {t(group.groupKey)}
              </p>
              {group.fonts.map((font) => {
                const isActive = font === activeFont;
                return (
                  <button
                    key={font}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-left ${
                      isActive ? 'bg-accent-tint' : 'bg-transparent'
                    }`}
                  >
                    <span
                      style={{ fontFamily: `'${font}', ${group.stack}` }}
                      className="text-xl leading-none text-ink"
                    >
                      {font}
                    </span>
                    {isActive && <span className="text-sm text-accent-strong">✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
