/**
 * SizePanel (panel de tamaño de lienzo)
 * Panel izquierdo del editor (264px): gestiona la imagen de fondo, las
 * dimensiones del lienzo y las capas de texto.
 *
 * El bloque "Lienzo" delega en `PresetGroup` (accesos directos del catálogo) y
 * en `SizeInputs` (medida a mano); aquí solo queda su composición.
 */

import { Button } from '@/sharedComponents/Button';
import { useT } from '@/i18n/useI18n';
import { PresetGroup } from './PresetGroup';
import { SizeInputs } from './SizeInputs';

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
          {t('panel.size.canvas')}
        </p>

        <PresetGroup group="kdp" />
        <PresetGroup group="ratio" />
        <SizeInputs />
      </div>

      <div className="p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            {t('panel.size.textLayers')}
          </p>
          <Button size="iconSm" className="text-base leading-none text-accent">
            +
          </Button>
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
              <Button variant="danger" size="none" className="flex-none p-1 text-lg leading-none">
                ×
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
