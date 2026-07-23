/**
 * CONTRATO · Catálogo de mensajes (i18n)
 * --------------------------------------
 * Único lugar donde viven los textos de la interfaz, en castellano (`es`) y
 * catalán (`ca`). Los componentes NO escriben cadenas literales visibles: piden
 * el texto por su clave con el hook `useT()`.
 *
 * Cómo mantenerlo:
 *  - Cada clave debe existir en los DOS idiomas (el tipo `Record<Lang, ...>` y
 *    el `satisfies` obligan a ello: si falta una traducción, no compila).
 *  - Claves con prefijo por zona (`home.*`, `panel.text.*`, `export.*`…) para
 *    mantenerlo navegable a medida que crezca la UI.
 *  - `MessageKey` se deriva automáticamente de las claves de `es`.
 */

import type { Lang } from './config';

export const messages = {
  es: {
    'home.appName': 'Editor de portadas',
    'home.badge': 'libros · KDP',
    'home.screenTitle': 'Portada',
    'home.export': 'Exportar',
    'home.tabs.label': 'Paneles de edición',
    'home.tab.text': 'Texto',
    'home.tab.font': 'Fuente',
    'home.tab.color': 'Color',
    'home.tab.canvas': 'Lienzo',
    'sheet.done': 'Hecho',
    'lang.label': 'Idioma',
  },
  ca: {
    'home.appName': 'Editor de portades',
    'home.badge': 'llibres · KDP',
    'home.screenTitle': 'Portada',
    'home.export': 'Exportar',
    'home.tabs.label': "Taulers d'edició",
    'home.tab.text': 'Text',
    'home.tab.font': 'Tipografia',
    'home.tab.color': 'Color',
    'home.tab.canvas': 'Llenç',
    'sheet.done': 'Fet',
    'lang.label': 'Idioma',
  },
} satisfies Record<Lang, Record<string, string>>;

/** Clave de mensaje válida (derivada del catálogo en castellano). */
export type MessageKey = keyof (typeof messages)['es'];
