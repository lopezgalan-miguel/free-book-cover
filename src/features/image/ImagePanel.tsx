/**
 * CONTRATO · ImagePanel (imagen de fondo)
 * ---------------------------------------
 * Todo lo que el usuario hace con el fondo desde los paneles: subirlo,
 * cambiarlo, elegir su encaje y devolverlo al centro.
 *
 * Cómo lo hace:
 *  - La subida y su validación viven en `useImageUpload`; aquí solo se pinta.
 *  - Los controles de encaje y centrado solo existen si hay imagen: sin ella no
 *    hay nada que encajar.
 *  - Rellenar/Ajustar son modos (uno queda marcado); Centrar es una acción y
 *    por eso nunca se marca.
 *  - Recolocar el fondo se hace arrastrando sobre el lienzo (Fase 2A); aquí
 *    solo se recuerda con una pista.
 */

import { useT } from '@/i18n/useI18n';
import { Button } from '@/sharedComponents/Button';
import { useEditorStore } from '@/store/editorStore';
import { ACCEPTED_TYPES, useImageUpload } from './useImageUpload';

export const ImagePanel = () => {
  const t = useT();
  const image = useEditorStore((state) => state.image);
  const setImageFit = useEditorStore((state) => state.setImageFit);
  const centerImage = useEditorStore((state) => state.centerImage);
  const { onFileChange, error } = useImageUpload();

  return (
    <section data-panel="image" className="border-b border-line-soft p-4">
      <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
        {t('panel.size.backgroundImage')}
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-panel px-3 py-2.5 hover:border-accent-strong hover:bg-white">
        <div className="h-[52px] w-[38px] flex-none overflow-hidden rounded bg-stage-dark">
          {image && (
            <img
              src={image.src}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {image ? t('panel.size.changeImage') : t('panel.size.uploadImage')}
          </p>
          <p className="truncate text-[10.5px] text-muted">
            {image ? image.fileName : t('panel.size.formats')}
          </p>
        </div>
        <input
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={onFileChange}
          className="hidden"
        />
      </label>

      {error && <p className="mt-1.5 text-[10.5px] text-danger">{t(error)}</p>}

      {image && (
        <>
          <div className="mt-2.5 flex gap-1.5">
            <Button
              size="sm"
              isActive={image.fit === 'cover'}
              onClick={() => setImageFit('cover')}
              className={`flex-1 text-[11.5px] font-semibold ${
                image.fit === 'cover' ? 'text-accent-strong' : 'text-ink-soft'
              }`}
            >
              {t('panel.image.fill')}
            </Button>
            <Button
              size="sm"
              isActive={image.fit === 'contain'}
              onClick={() => setImageFit('contain')}
              className={`flex-1 text-[11.5px] font-semibold ${
                image.fit === 'contain' ? 'text-accent-strong' : 'text-ink-soft'
              }`}
            >
              {t('panel.image.fit')}
            </Button>
            <Button
              size="sm"
              onClick={centerImage}
              className="flex-1 text-[11.5px] font-semibold text-ink-soft"
            >
              {t('panel.image.center')}
            </Button>
          </div>

          <p className="mt-2 text-[10.5px] text-muted">{t('panel.image.dragHint')}</p>
        </>
      )}
    </section>
  );
};
