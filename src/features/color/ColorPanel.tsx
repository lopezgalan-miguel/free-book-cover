/**
 * CONTRATO · ColorPanel (panel de color)
 * --------------------------------------
 * Selecciona el color del bloque seleccionado de tres formas: picker nativo
 * (<input type="color">), código hexadecimal por teclado, y una paleta de
 * muestras rápidas. Todo se refleja al instante en el preview.
 *
 * Cómo lo hará:
 *  - Lee `color` del bloque seleccionado; muta con `patchSelected({ color })`.
 *  - El hex tecleado pasa SIEMPRE por utils/hex (normalizeHex) antes de guardar,
 *    de modo que en el modelo solo entran colores válidos `#RRGGBB`.
 */

export const ColorPanel = () => {
  return <section data-panel="color" />;
};
