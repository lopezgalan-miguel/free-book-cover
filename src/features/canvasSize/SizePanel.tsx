/**
 * CONTRATO · SizePanel (panel de tamaño de lienzo)
 * -----------------------------------------------
 * Fija las dimensiones de salida del lienzo, y solo eso: la imagen de fondo es
 * de `features/image/ImagePanel` y las capas de `features/layers/LayerList`.
 *
 * Cómo lo hace: delega en `PresetGroup` (accesos directos del catálogo de
 * presets) y en `SizeInputs` (medida a mano en píxeles). Aquí solo queda su
 * composición y el título de la sección.
 */

import { useT } from '@/i18n/useI18n';
import { PresetGroup } from './PresetGroup';
import { SizeInputs } from './SizeInputs';

export const SizePanel = () => {
  const t = useT();

  return (
    <section data-panel="size" className="border-b border-line-soft p-4">
      <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
        {t('panel.size.canvas')}
      </p>

      <PresetGroup group="kdp" />
      <PresetGroup group="ratio" />
      <SizeInputs />
    </section>
  );
};
