/**
 * CONTRATO · Selector de idioma (CA / ES)
 * ---------------------------------------
 * Control segmentado que permite alternar entre castellano y catalán. Lee y
 * escribe el idioma en el store de i18n; no guarda estado propio. Además
 * dispara `retranslateBlocks` en el editorStore para que los bloques de texto
 * que aún tengan su contenido de partida (título/subtítulo/autor/"texto
 * nuevo") cambien de idioma junto con la UI; los bloques ya editados por el
 * usuario no se tocan.
 *
 * Vive en la cabecera (fondo claro) y muestra el código corto de cada idioma
 * (ES/CA) para caber también en móvil; el nombre completo va en `title`.
 *
 * Accesible: es un grupo de botones con `aria-pressed` para el idioma activo.
 */

import { LANGS, LANG_LABELS } from './config';
import { useLang, useSetLang, useT } from './useI18n';
import { useEditorStore } from '@/store/editorStore';

export const LanguageSwitcher = () => {
  const lang = useLang();
  const setLang = useSetLang();
  const retranslateBlocks = useEditorStore((state) => state.retranslateBlocks);
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-semibold"
    >
      {LANGS.map((code) => {
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            title={LANG_LABELS[code]}
            onClick={() => {
              setLang(code);
              retranslateBlocks(code);
            }}
            aria-pressed={active}
            className={
              active
                ? 'bg-accent px-2.5 py-1 text-panel'
                : 'px-2.5 py-1 text-ink-soft hover:text-ink'
            }
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};
