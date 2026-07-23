/**
 * CONTRATO · Selector de idioma (CA / ES)
 * ---------------------------------------
 * Control segmentado que permite alternar entre castellano y catalán. Lee y
 * escribe el idioma en el store de i18n; no guarda estado propio.
 *
 * Vive en la cabecera (fondo claro) y muestra el código corto de cada idioma
 * (ES/CA) para caber también en móvil; el nombre completo va en `title`.
 *
 * Accesible: es un grupo de botones con `aria-pressed` para el idioma activo.
 */

import { LANGS, LANG_LABELS } from './config';
import { useLang, useSetLang, useT } from './useI18n';

export const LanguageSwitcher = () => {
  const lang = useLang();
  const setLang = useSetLang();
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
            onClick={() => setLang(code)}
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
