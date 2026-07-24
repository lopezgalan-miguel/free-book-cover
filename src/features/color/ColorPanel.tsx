/**
 * ColorPanel (panel de color)
 * Selecciona el color del bloque seleccionado: picker nativo,
 * código hexadecimal por teclado, y paleta de muestras rápidas.
 */

import { useT } from '@/i18n/useI18n';

const swatches = [
  '#FFFFFF',
  '#F4EFE6',
  '#C2B6A1',
  '#8C6F47',
  '#2B2824',
  '#1A1712',
  '#B4453A',
  '#3E5C4B',
];

const selectedColor = '#F4EFE6';

export const ColorPanel = () => {
  const t = useT();

  return (
    <section data-panel="color" className="flex flex-col gap-0">
      <div className="p-4">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {t('panel.color.title')}
        </p>

        <div className="mb-3 flex items-center gap-2.5">
          <input
            type="color"
            value={selectedColor}
            className="h-10 w-11 cursor-pointer rounded-lg border border-line bg-white p-1"
          />
          <div className="flex flex-1 items-center rounded-lg border border-line bg-white px-2.5">
            <span className="font-mono text-sm text-muted">#</span>
            <input
              type="text"
              maxLength={6}
              defaultValue={selectedColor.replace('#', '')}
              placeholder={t('panel.color.hexPlaceholder')}
              className="flex-1 border-none bg-transparent px-1.5 py-2.5 font-mono text-sm uppercase text-ink outline-none"
            />
          </div>
        </div>

        <div className="flex gap-1.5">
          {swatches.map((hex) => (
            <button
              key={hex}
              title={hex}
              className="h-6 flex-1 rounded cursor-pointer border border-black/10"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
