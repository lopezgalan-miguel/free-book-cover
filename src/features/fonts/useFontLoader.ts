/**
 * CONTRATO · useFontLoader
 * ------------------------
 * Carga y registra fuentes en el documento para que estén disponibles tanto en
 * el preview como en la exportación. Cubre dos casos: fuentes web (Google
 * Fonts, ya declaradas) y fuentes SUBIDAS por el usuario.
 *
 * Cómo lo hará:
 *  - `loadCustomFont(file)`: deriva un nombre limpio del fichero, crea un
 *    FontFace con una object URL, lo carga y lo añade a `document.fonts`.
 *    Devuelve el nombre registrado (para guardarlo en el store).
 *  - `ensureFontsReady()`: espera a `document.fonts.ready` antes de exportar,
 *    garantizando que renderToCanvas pinte con la tipografía correcta.
 *
 * Seguridad: valida extensión/tipo del fichero y revoca las URLs temporales.
 */

export interface UseFontLoaderResult {
  loadCustomFont: (file: File) => Promise<string>;
  ensureFontsReady: () => Promise<void>;
}

export function useFontLoader(): UseFontLoaderResult {
  // TODO(equipo): implementar la carga con FontFace y la espera de fonts.ready.
  return {
    loadCustomFont: async () => {
      throw new Error('loadCustomFont: pendiente de implementar');
    },
    ensureFontsReady: async () => {
      await document.fonts.ready;
    },
  };
}
