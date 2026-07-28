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
 * Forma: pastilla segmentada del mockup — la caja lleva el fondo `accent-tint`
 * y el idioma activo se pinta encima en `accent`. El contraste sale de ese
 * relleno, no de un borde: así el control se lee como un interruptor de dos
 * posiciones y no como dos botones sueltos. Los botones son más altos en móvil
 * (objetivo táctil) y se compactan en `lg`, como en los dos mockups.
 *
 * Posición, según los mockups: en escritorio ABRE el grupo derecho de la
 * cabecera (idioma → dimensiones → Exportar) y en móvil ocupa el extremo
 * izquierdo de la barra. Es una preferencia, no un control de edición: por eso
 * va fuera de los paneles y siempre a la vista, en el mismo sitio en las dos
 * presentaciones.
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
      className="inline-flex gap-0.5 rounded-lg bg-accent-tint p-0.5 text-[11px] font-semibold"
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
            className={`rounded-md px-3 py-1.5 lg:px-2.5 lg:py-1 ${
              active ? 'bg-accent text-panel' : 'text-muted hover:text-ink'
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};
