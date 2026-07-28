/**
 * CONTRATO · FONT_CATALOG (catálogo de tipografías)
 * -------------------------------------------------
 * Fuente única de verdad de qué tipografías ofrece el editor. Lo consumen el
 * `FontPanel` (para listarlas) y, más adelante, la exportación (para saber qué
 * tiene que estar cargado antes de pintar).
 *
 * Reglas:
 *  - `family` es el dato que se guarda en `TextBlock.fontFamily`. Es un valor
 *    del proyecto, no una etiqueta: no se traduce y no se cambia a la ligera,
 *    porque los proyectos ya guardados lo referencian por nombre.
 *  - Toda familia con `bundled: true` está declarada en `coverFonts.css`. Las
 *    dos listas van juntas: si una familia se declara aquí y no allí, el panel
 *    ofrece algo que no carga. Esa fue exactamente la avería que este catálogo
 *    viene a cerrar — se ofrecían 13 familias y solo cargaba una.
 *  - `stack` es el respaldo de esa familia concreta, no el de su grupo: Cinzel
 *    es una serif aunque se liste entre las de titular.
 *  - `weightRange` y `hasItalic` documentan lo que el fichero cubre de verdad,
 *    no lo que la interfaz deja pedir. Marcellus y Bebas Neue son diseños de un
 *    solo peso, y cuatro familias no tienen corte itálico: en esos casos el
 *    navegador sintetiza el resultado. Los controles siguen activos —la
 *    síntesis hace su papel— pero aquí queda escrito cuáles son.
 *  - Las de grupo `system` no se empaquetan (`bundled: false`): las pone el
 *    sistema operativo y pueden no existir. Están por comodidad, no por diseño.
 */

import type { MessageKey } from '@/i18n/messages';

/**
 * Grupo del catálogo: decide bajo qué epígrafe se lista la familia.
 * `custom` es el único que no tiene entradas aquí — sus familias las sube el
 * usuario y viven en el store (`customFonts`), no en este fichero.
 */
export type FontGroupId = 'serif' | 'sans' | 'display' | 'system' | 'custom';

/** Grupo de una familia del catálogo (todos menos el de las subidas). */
export type CatalogGroupId = Exclude<FontGroupId, 'custom'>;

export interface CatalogFont {
  /** Nombre CSS de la familia. Es lo que se guarda en `TextBlock.fontFamily`. */
  family: string;
  group: CatalogGroupId;
  /** Respaldo si la familia no está disponible. Propio de cada familia. */
  stack: string;
  /** Se empaqueta con la app (declarada en `coverFonts.css`). */
  bundled: boolean;
  /** Pesos que cubre el fichero, `[min, max]`. Un solo peso: `[400, 400]`. */
  weightRange: [number, number];
  /**
   * Tiene corte itálico dibujado. Si es `false`, activar la cursiva sobre esta
   * familia da una oblicua sintética: el navegador inclina la redonda en vez de
   * usar otro dibujo. Se sigue permitiendo —hace su papel— pero el panel puede
   * avisar de que no es una itálica de verdad.
   */
  hasItalic: boolean;
}

export const FONT_GROUP_TITLE_KEY: Record<FontGroupId, MessageKey> = {
  custom: 'panel.font.group.custom',
  serif: 'panel.font.group.serif',
  sans: 'panel.font.group.sansSerif',
  display: 'panel.font.group.display',
  system: 'panel.font.group.system',
};

/**
 * Orden en que se pintan los grupos en el panel. Las subidas van primero
 * aunque el mockup no las dibuje: la lista tiene alto fijo y hace scroll, y una
 * fuente recién subida al final del todo parecería no haberse añadido. Mientras
 * el usuario no suba ninguna, el grupo no existe y el orden es el del mockup.
 */
export const FONT_GROUP_ORDER: FontGroupId[] = ['custom', 'serif', 'sans', 'display', 'system'];

export const FONT_CATALOG: CatalogFont[] = [
  // --- Serif ---
  { family: 'Playfair Display', group: 'serif', stack: 'serif', bundled: true, weightRange: [400, 900], hasItalic: true },
  { family: 'Cormorant Garamond', group: 'serif', stack: 'serif', bundled: true, weightRange: [300, 700], hasItalic: true },
  { family: 'EB Garamond', group: 'serif', stack: 'serif', bundled: true, weightRange: [400, 800], hasItalic: true },
  { family: 'Libre Baskerville', group: 'serif', stack: 'serif', bundled: true, weightRange: [400, 700], hasItalic: true },
  { family: 'Lora', group: 'serif', stack: 'serif', bundled: true, weightRange: [400, 700], hasItalic: true },
  { family: 'Spectral', group: 'serif', stack: 'serif', bundled: true, weightRange: [400, 700], hasItalic: true },
  { family: 'Marcellus', group: 'serif', stack: 'serif', bundled: true, weightRange: [400, 400], hasItalic: false },

  // --- Sans serif ---
  { family: 'Montserrat', group: 'sans', stack: 'sans-serif', bundled: true, weightRange: [100, 900], hasItalic: true },
  { family: 'Josefin Sans', group: 'sans', stack: 'sans-serif', bundled: true, weightRange: [100, 700], hasItalic: true },
  { family: 'Archivo', group: 'sans', stack: 'sans-serif', bundled: true, weightRange: [100, 900], hasItalic: true },

  // --- Titular ---
  { family: 'Bebas Neue', group: 'display', stack: 'sans-serif', bundled: true, weightRange: [400, 400], hasItalic: false },
  { family: 'Oswald', group: 'display', stack: 'sans-serif', bundled: true, weightRange: [200, 700], hasItalic: false },
  { family: 'Cinzel', group: 'display', stack: 'serif', bundled: true, weightRange: [400, 900], hasItalic: false },

  // --- Del sistema (no se empaquetan) ---
  { family: 'Georgia', group: 'system', stack: 'serif', bundled: false, weightRange: [400, 700], hasItalic: true },
  { family: 'Times New Roman', group: 'system', stack: 'serif', bundled: false, weightRange: [400, 700], hasItalic: true },
  { family: 'Arial', group: 'system', stack: 'sans-serif', bundled: false, weightRange: [400, 700], hasItalic: true },
  { family: 'Helvetica', group: 'system', stack: 'sans-serif', bundled: false, weightRange: [400, 700], hasItalic: true },
  { family: 'Verdana', group: 'system', stack: 'sans-serif', bundled: false, weightRange: [400, 700], hasItalic: true },
];

/** Familias de un grupo, en el orden del catálogo. */
export const fontsOfGroup = (group: CatalogGroupId): CatalogFont[] =>
  FONT_CATALOG.filter((font) => font.group === group);

/**
 * Valor de `font-family` listo para CSS: la familia entrecomillada más su
 * respaldo. Único sitio donde se arma esa cadena, para que el preview, el panel
 * y la exportación no puedan discrepar.
 */
export const fontStackOf = (family: string): string => {
  const entry = FONT_CATALOG.find((font) => font.family === family);
  return `'${family}', ${entry?.stack ?? 'serif'}`;
};

/**
 * Si la cursiva de esa familia será un corte dibujado o una oblicua sintética.
 * Una familia desconocida (por ejemplo una subida por el usuario) cuenta como
 * sintética: no sabemos qué cortes trae.
 */
export const hasRealItalic = (family: string): boolean =>
  FONT_CATALOG.find((font) => font.family === family)?.hasItalic ?? false;
