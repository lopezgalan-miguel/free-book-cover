/**
 * CONTRATO · Configuración de idiomas
 * -----------------------------------
 * Define los idiomas soportados por la aplicación (castellano y catalán), el
 * idioma por defecto y las etiquetas legibles para el selector.
 *
 * Es la única fuente de verdad sobre "qué idiomas existen": el store, el
 * catálogo de mensajes y el selector se apoyan en estos tipos para no
 * desincronizarse.
 */

/** Idiomas soportados. El orden es el que usa el selector CA/ES. */
export const LANGS = ['es', 'ca'] as const;

/** Código de idioma soportado. */
export type Lang = (typeof LANGS)[number];

/** Idioma por defecto (castellano) cuando no hay preferencia guardada. */
export const DEFAULT_LANG: Lang = 'es';

/** Etiqueta legible de cada idioma, para mostrar en el selector. */
export const LANG_LABELS: Record<Lang, string> = {
  es: 'Castellano',
  ca: 'Català',
};
