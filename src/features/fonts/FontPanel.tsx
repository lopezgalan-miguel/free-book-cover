/**
 * CONTRATO · FontPanel (panel de tipografías)
 * -------------------------------------------
 * Elige la tipografía del bloque seleccionado. Lista las familias de
 * `FONT_CATALOG` agrupadas (Personalizada, Serif, Sans serif, Titular, Sistema)
 * y escribe cada nombre con su propia tipografía, que es la única muestra que
 * importa al componer una portada.
 *
 * Cómo lo hace:
 *  - El catálogo NO se define aquí: se lee de `catalog.ts`. Tenerlo dentro de
 *    este componente fue lo que permitió que el panel ofreciera 13 familias y
 *    solo cargara una, sin que nada lo delatara.
 *  - La cadena `font-family` de la muestra sale de `fontStackOf`, la misma que
 *    usa el lienzo: lo que se ve aquí es lo que se verá en la portada.
 *  - Elegir una familia escribe `fontFamily` con `patchSelected`; la marcada es
 *    siempre la del bloque, no un estado local que pudiera desincronizarse.
 *  - Las fuentes subidas salen del store (`customFonts`) y se listan como un
 *    grupo más. La subida y su validación viven en `useFontUpload`.
 *  - Sin selección no se pinta nada: el estado vacío lo resuelve `Home`, igual
 *    que con `StylePanel` y `ColorPanel`.
 */

import { useT } from '@/i18n/useI18n';
import { useSelectedBlock } from '@/features/text/useSelectedBlock';
import { useEditorStore } from '@/store/editorStore';
import {
  FONT_GROUP_ORDER,
  FONT_GROUP_TITLE_KEY,
  fontStackOf,
  fontsOfGroup,
  type FontGroupId,
} from './catalog';
import { ACCEPTED_FONT_EXTENSIONS } from './useFontLoader';
import { useFontUpload } from './useFontUpload';

interface FontGroup {
  id: FontGroupId;
  families: string[];
}

export const FontPanel = () => {
  const t = useT();
  const block = useSelectedBlock();
  const customFonts = useEditorStore((state) => state.customFonts);
  const patchSelected = useEditorStore((state) => state.patchSelected);
  const { onFileChange, error } = useFontUpload();

  if (!block) return null;

  /** Grupos con contenido: el de las subidas no existe hasta que hay alguna. */
  const fontGroups: FontGroup[] = FONT_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    families:
      groupId === 'custom'
        ? customFonts.map((font) => font.name)
        : fontsOfGroup(groupId).map((font) => font.family),
  })).filter((group) => group.families.length > 0);

  return (
    <section data-panel="fonts" className="flex flex-col gap-0">
      <div className="border-b border-line-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            {t('panel.font.title')}
          </p>
          <label
            title={t('panel.font.uploadHint')}
            className="cursor-pointer text-sm font-medium text-accent hover:text-accent-strong"
          >
            {t('panel.font.upload')}
            <input
              type="file"
              accept={ACCEPTED_FONT_EXTENSIONS.join(',')}
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </div>

        {error && <p className="mb-1.5 text-[10.5px] text-danger">{t(error)}</p>}

        <div className="max-h-[186px] overflow-y-auto rounded-lg border border-line-soft bg-white p-1.5">
          {fontGroups.map((group) => (
            <div key={group.id}>
              <p className="px-2 py-2 text-[9.5px] uppercase tracking-wider text-muted">
                {t(FONT_GROUP_TITLE_KEY[group.id])}
              </p>
              {group.families.map((family) => {
                const isActive = family === block.fontFamily;
                return (
                  <button
                    key={family}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => patchSelected({ fontFamily: family })}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-left ${
                      isActive ? 'bg-accent-tint' : 'bg-transparent'
                    }`}
                  >
                    <span
                      style={{ fontFamily: fontStackOf(family) }}
                      className="text-xl leading-none text-ink"
                    >
                      {family}
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
