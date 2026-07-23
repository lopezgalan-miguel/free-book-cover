/**
 * CONTRATO · Estado y hook de i18n
 * --------------------------------
 * El idioma activo vive aquí (store Zustand con persistencia en localStorage),
 * separado del `editorStore` porque es una preferencia de UI, no dominio.
 *
 * API pública:
 *  - `useLang()`   → idioma activo (para el selector / lógica condicional).
 *  - `useSetLang()`→ acción para cambiar de idioma.
 *  - `useT()`      → función `t(key)` que devuelve el texto en el idioma activo,
 *                    con fallback al idioma por defecto y, en último caso, a la
 *                    propia clave (así nunca se rompe la UI si falta un texto).
 *
 * Por defecto arranca en castellano; la elección del usuario se recuerda entre
 * sesiones bajo la clave `fbc-lang`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LANG, type Lang } from './config';
import { messages, type MessageKey } from './messages';

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: DEFAULT_LANG,
      setLang: (lang) => set({ lang }),
    }),
    { name: 'fbc-lang' },
  ),
);

/** Idioma activo. */
export const useLang = () => useI18nStore((s) => s.lang);

/** Acción para cambiar el idioma activo. */
export const useSetLang = () => useI18nStore((s) => s.setLang);

/** Devuelve la función de traducción `t(key)` ligada al idioma activo. */
export const useT = () => {
  const lang = useI18nStore((s) => s.lang);
  return (key: MessageKey): string =>
    messages[lang][key] ?? messages[DEFAULT_LANG][key] ?? key;
};
