/**
 * CONTRATO · TexturePicker (textura del texto)
 * --------------------------------------------
 * Control de la imagen que rellena el texto del bloque seleccionado: subirla,
 * cambiarla, quitarla y ajustar su encaje y su opacidad. Vive dentro de
 * *Efectos*, entre Contorno y Curvatura.
 *
 * Cómo lo hace:
 *  - La subida y su validación viven en `useTextureUpload`; aquí solo se pinta.
 *  - «Quitar» y los ajustes finos (encaje y opacidad) solo existen con textura
 *    puesta: sin ella no hay nada que encajar ni que atenuar.
 *  - Un ÚNICO componente para móvil y escritorio: los dos paneles montan el
 *    mismo `StylePanel`, así que duplicarlo solo abriría la puerta a que las
 *    dos versiones se separaran.
 *  - Sin selección no se pinta nada, igual que el resto del panel de estilo.
 */

import { useT } from '@/i18n/useI18n';
import { ACCEPTED_TYPES } from '@/features/image/useImageUpload';
import { Button } from '@/sharedComponents/Button';
import { Slider } from '@/sharedComponents/Slider';
import { useSelectedBlock } from '@/features/text/useSelectedBlock';
import { useEditorStore } from '@/store/editorStore';
import type { ImageFit } from '@/types/editor';
import { useTextureUpload } from './useTextureUpload';

const FITS: { value: ImageFit; labelKey: 'panel.image.fill' | 'panel.image.fit' }[] = [
  { value: 'cover', labelKey: 'panel.image.fill' },
  { value: 'contain', labelKey: 'panel.image.fit' },
];

export const TexturePicker = () => {
  const t = useT();
  const block = useSelectedBlock();
  const setSelectedTexture = useEditorStore((state) => state.setSelectedTexture);
  const patchSelectedTexture = useEditorStore((state) => state.patchSelectedTexture);
  const { onFileChange, error } = useTextureUpload();

  if (!block) return null;

  const texture = block.texture;

  return (
    <div data-control="texture">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-ink">{t('panel.style.texture')}</span>
        {texture && (
          <Button
            variant="danger"
            size="none"
            onClick={() => setSelectedTexture(null)}
            className="text-[11.5px]"
          >
            {t('panel.style.textureRemove')}
          </Button>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-line bg-panel px-3 py-2.5 hover:border-accent-strong hover:bg-white">
        <div className="h-[34px] w-[34px] flex-none overflow-hidden rounded-md border border-line bg-stage-dark">
          {texture && <img src={texture.src} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-ink">{t('panel.style.textureAdd')}</p>
          {texture && <p className="truncate text-[10.5px] text-muted">{texture.fileName}</p>}
        </div>
        <input
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={onFileChange}
          className="hidden"
        />
      </label>

      {error && <p className="mt-1.5 text-[10.5px] text-danger">{t(error)}</p>}

      {texture && (
        <>
          <div className="mt-2.5 flex gap-1.5">
            {FITS.map((fitOption) => (
              <Button
                key={fitOption.value}
                size="sm"
                isActive={texture.fit === fitOption.value}
                onClick={() => patchSelectedTexture({ fit: fitOption.value })}
                className={`flex-1 text-[11.5px] font-semibold ${
                  texture.fit === fitOption.value ? 'text-accent-strong' : 'text-ink-soft'
                }`}
              >
                {t(fitOption.labelKey)}
              </Button>
            ))}
          </div>

          <div className="mt-3">
            <Slider
              label={t('panel.style.textureOpacity')}
              value={texture.opacity}
              min={0}
              max={100}
              step={1}
              valueLabel={`${texture.opacity}%`}
              onChange={(value) => patchSelectedTexture({ opacity: value })}
            />
          </div>
        </>
      )}
    </div>
  );
};
