/**
 * CONTRATO · Modelo de dominio (fuente única de verdad)
 * ------------------------------------------------------
 * Todo el editor lee y escribe estos tipos. Cualquier feature (canvas, texto,
 * fuentes, color, tamaño, export) trabaja sobre estas formas y NUNCA inventa
 * las suyas. Si algo no se puede expresar con estos tipos, se amplía AQUÍ.
 *
 * Regla de diseño: el modelo es serializable (JSON puro, sin funciones ni
 * referencias al DOM) para poder guardar/restaurar un proyecto y para exportar
 * sin ambigüedad. Las posiciones se guardan en PORCENTAJE (0–100) relativo al
 * lienzo, de modo que el diseño es independiente de la resolución de salida:
 * el mismo proyecto se exporta idéntico a 1600px o a 4000px.
 */

/** Alineación horizontal del texto dentro de su bloque. */
export type TextAlign = 'left' | 'center' | 'right';

/** Cómo encaja la imagen de fondo en el lienzo. */
export type ImageFit = 'cover' | 'contain';

/**
 * Un color en formato hexadecimal `#RRGGBB` en mayúsculas.
 * Se valida y normaliza siempre a través de `utils/hex.ts`.
 */
export type HexColor = `#${string}`;

/**
 * Imagen que rellena el texto de un bloque. Es una PROPIEDAD del bloque, no
 * una capa aparte: el relleno del texto es o un color o una textura, nunca los
 * dos. Mientras hay textura manda ella y `color` queda en reserva, de modo que
 * al quitarla el bloque recupera exactamente el color que tenía.
 */
export interface BlockTexture {
  /** URL de objeto (blob:) o data URL de la imagen cargada. */
  src: string;
  /** Nombre original del fichero, para mostrarlo en la UI. */
  fileName: string;
  /** Cómo encaja la imagen dentro del texto que rellena. */
  fit: ImageFit;
  /** Opacidad del relleno (0–100). El render la aplica SOLO a la textura. */
  opacity: number;
}

/**
 * Bloque de texto: unidad editable e independiente sobre el lienzo.
 * Es "una capa". El usuario puede tener N bloques y arrastrarlos libremente.
 */
export interface TextBlock {
  /** Identificador estable, único dentro del proyecto. */
  id: string;

  // --- Contenido ---
  /** Texto crudo; los saltos de línea (`\n`) se respetan en el render. */
  text: string;
  /**
   * Clave del catálogo i18n si `text` sigue siendo el texto de partida sin
   * editar (título/subtítulo/autor/"texto nuevo"); `null` en cuanto el usuario
   * lo modifica. Permite retraducir los bloques aún no editados al cambiar de
   * idioma sin tocar los que ya contienen texto propio del usuario.
   */
  placeholderKey: string | null;

  // --- Posición (en % del lienzo, 0–100). El origen es el CENTRO del bloque. ---
  x: number;
  y: number;

  // --- Marco (recuadro de selección, independiente del tamaño del texto). ---
  /** Ancho del marco en % del lienzo, o null para auto-ajustar al texto. */
  boxWidthPct: number | null;
  /** Alto del marco en % del lienzo, o null para auto-ajustar al texto. */
  boxHeightPct: number | null;

  // --- Tipografía ---
  /** Nombre legible de la familia, p.ej. "Playfair Display". */
  fontFamily: string;
  /** Grosor CSS (400 normal, 700 negrita). */
  fontWeight: number;
  /** Tamaño como % del ANCHO del lienzo, para escalar con la resolución. */
  fontSizePct: number;
  italic: boolean;
  underline: boolean;
  /** Fuerza mayúsculas en el render sin alterar `text`. */
  uppercase: boolean;
  align: TextAlign;
  /** Interlineado (multiplicador de la altura de línea). */
  lineHeight: number;
  /** Espaciado entre letras en `em`. */
  letterSpacing: number;

  // --- Color y efectos ---
  color: HexColor;
  shadow: boolean;
  /**
   * Intensidad de la sombra (0–100). Gobierna a la vez el desplazamiento, el
   * desenfoque y la opacidad: es un único mando de "cuánto se nota".
   */
  shadowIntensity: number;
  /**
   * Color de la sombra. Se guarda OPACO: la transparencia la deriva el render
   * de `shadowIntensity`, así el color elegido sigue siendo el que se ve en el
   * selector. Una sombra clara es lo que la hace visible sobre fondos oscuros.
   */
  shadowColor: HexColor;
  outline: boolean;
  /** Grosor del contorno (unidades relativas del render). */
  outlineWidth: number;
  outlineColor: HexColor;
  /**
   * Textura que rellena el texto, o `null` para rellenar con `color`.
   * Se cambia siempre con `setSelectedTexture`: es quien revoca la object URL
   * anterior.
   */
  texture: BlockTexture | null;
  /** Curvatura del texto: -100 (cóncavo) … 0 (recto) … 100 (convexo). */
  curve: number;
}

/** Imagen de fondo del lienzo. Puede no existir (proyecto en blanco). */
export interface CanvasImage {
  /** URL de objeto (blob:) o data URL de la imagen cargada. */
  src: string;
  /** Nombre original del fichero, para mostrarlo en la UI. */
  fileName: string;
  /** Encaje y desplazamiento del fondo (posición en %, 0–100). */
  fit: ImageFit;
  offsetX: number;
  offsetY: number;
}

/** Dimensiones reales de salida del lienzo, en píxeles. */
export interface CanvasSize {
  width: number;
  height: number;
}

/** Formatos de exportación soportados. */
export type ExportFormat = 'PNG' | 'JPEG' | 'WebP' | 'PDF';

/**
 * Los presets de lienzo (`CanvasPreset`) viven en
 * `features/canvasSize/presets.ts`: son un catálogo de la interfaz, no parte
 * del proyecto serializable (de un preset solo se guardan aquí el `size`
 * resultante y su `activePresetId`), y necesitan claves i18n que este modelo
 * no importa.
 */

/** Una fuente cargada por el usuario (.ttf/.otf/.woff) ya registrada. */
export interface CustomFont {
  /** Nombre con el que se registró en `document.fonts`. */
  name: string;
}

/**
 * Estado completo del editor. Es lo que persiste el store (`editorStore`).
 * Un proyecto = una instancia de esta forma.
 */
export interface EditorState {
  blocks: TextBlock[];
  /** Id del bloque seleccionado, o null si no hay selección. */
  selectedBlockId: string | null;
  image: CanvasImage | null;
  size: CanvasSize;
  /** Id del preset activo, o 'custom' si el usuario tecleó medidas. */
  activePresetId: string;
  customFonts: CustomFont[];
  exportFormat: ExportFormat;
  /**
   * Calidad de los formatos con pérdida (JPEG/WebP), en % (40–100). PNG y PDF
   * la ignoran: no tienen nada que perder.
   */
  exportQuality: number;
}
