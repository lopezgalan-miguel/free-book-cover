/**
 * CONTRATO · useFontLoader
 * ------------------------
 * Mecánica de carga de fuentes en el documento. Es la capa de bajo nivel: sabe
 * de `FontFace` y de `document.fonts`, y NO sabe nada del store ni de la UI
 * (de eso se ocupa `useFontUpload`). Sirve a dos amos: el panel, que registra
 * fuentes subidas por el usuario, y la exportación, que necesita saber que todo
 * está cargado antes de rasterizar.
 *
 * Cómo lo hace:
 *  - `loadCustomFont(fontFile, takenFamilies)`: valida la extensión, deriva un
 *    nombre de familia del nombre del fichero, lo hace único frente a
 *    `takenFamilies` y lo registra en `document.fonts`. Devuelve un resultado
 *    explícito (`ok`) en vez de lanzar: el error es un caso previsto —el
 *    usuario elige el fichero equivocado— y quien llama tiene que pintarlo.
 *  - `ensureFontsReady()`: espera a `document.fonts.ready` antes de exportar,
 *    para que `renderToCanvas` pinte con la tipografía correcta y no con la de
 *    respaldo.
 *
 * Seguridad: solo se admiten las cuatro extensiones de fuente conocidas, y la
 * object URL se revoca en cuanto el navegador ha leído el fichero — el
 * `FontFace` ya guarda los datos por su cuenta.
 */

import type { MessageKey } from '@/i18n/messages';

/**
 * Extensiones admitidas. Se valida por extensión y no por MIME porque con las
 * fuentes los navegadores no se ponen de acuerdo: el mismo .ttf llega como
 * `font/ttf`, `application/x-font-ttf` o directamente vacío.
 * Se exporta para que el `accept` del `<input>` no pueda divergir de aquí.
 */
export const ACCEPTED_FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

/** Resultado de cargar una fuente: o sale el nombre registrado, o el motivo. */
export type FontLoadResult =
  | { ok: true; family: string }
  | { ok: false; errorKey: MessageKey };

export interface UseFontLoaderResult {
  loadCustomFont: (fontFile: File, takenFamilies: string[]) => Promise<FontLoadResult>;
  ensureFontsReady: () => Promise<void>;
}

const extensionOf = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex).toLowerCase();
};

/**
 * Nombre de familia a partir del nombre del fichero: fuera la extensión, y los
 * guiones y guiones bajos pasan a espacios ("MiFuente-Regular.woff2" →
 * "MiFuente Regular"). No se intenta adivinar el peso ni limpiar más: el
 * usuario reconoce su fichero por el nombre que le puso.
 */
const familyNameFrom = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  const withoutExtension = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  return withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Evita que una fuente subida se apropie de un nombre ya ocupado: subir
 * "Lora.ttf" no puede tapar la Lora empaquetada, porque los bloques guardan su
 * familia por nombre y cambiarían de tipografía sin tocarlos.
 */
const uniqueFamilyName = (baseName: string, takenFamilies: string[]): string => {
  if (!takenFamilies.includes(baseName)) return baseName;
  let attempt = 2;
  while (takenFamilies.includes(`${baseName} ${attempt}`)) attempt += 1;
  return `${baseName} ${attempt}`;
};

export const useFontLoader = (): UseFontLoaderResult => {
  const loadCustomFont = async (
    fontFile: File,
    takenFamilies: string[],
  ): Promise<FontLoadResult> => {
    if (!ACCEPTED_FONT_EXTENSIONS.includes(extensionOf(fontFile.name))) {
      return { ok: false, errorKey: 'panel.font.invalidType' };
    }

    const baseName = familyNameFrom(fontFile.name);
    if (!baseName) return { ok: false, errorKey: 'panel.font.invalidType' };

    const family = uniqueFamilyName(baseName, takenFamilies);
    const fileUrl = URL.createObjectURL(fontFile);

    try {
      const fontFace = new FontFace(family, `url("${fileUrl}")`);
      await fontFace.load();
      document.fonts.add(fontFace);
      return { ok: true, family };
    } catch {
      // Extensión correcta pero contenido que el navegador no sabe leer: un
      // fichero corrupto, o cualquier cosa renombrada a .ttf.
      return { ok: false, errorKey: 'panel.font.loadFailed' };
    } finally {
      URL.revokeObjectURL(fileUrl);
    }
  };

  const ensureFontsReady = async (): Promise<void> => {
    await document.fonts.ready;
  };

  return { loadCustomFont, ensureFontsReady };
};
