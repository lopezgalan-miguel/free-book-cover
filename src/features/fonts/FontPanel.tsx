/**
 * CONTRATO · FontPanel (panel de fuentes)
 * ---------------------------------------
 * Lista las familias disponibles agrupadas (Serif, Sans, Display, Sistema y
 * Personalizadas) mostrando cada nombre con su propia tipografía como muestra,
 * permite elegir una para el bloque seleccionado y SUBIR fuentes externas
 * (.ttf/.otf/.woff), que se cargan con useFontLoader.
 *
 * Cómo lo hará:
 *  - Lee `customFonts` y el bloque seleccionado del store; al elegir, muta con
 *    `patchSelected({ fontFamily })`.
 *  - Al subir un fichero, delega en useFontLoader (registra en document.fonts)
 *    y lo añade a `customFonts`. Alta calidad: usa los ficheros vectoriales tal
 *    cual, sin rasterizar.
 */

export function FontPanel() {
  return <section data-panel="fonts" />;
}
