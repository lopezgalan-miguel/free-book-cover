/**
 * CONTRATO · SizePanel (panel de tamaño de lienzo)
 * ------------------------------------------------
 * Cambia las dimensiones del lienzo. Ofrece accesos directos por preset
 * (16:9, 4:3, 1:1, KDP…) y campos numéricos de ancho/alto en píxeles para que
 * el usuario teclee medidas exactas. También gestiona la imagen de fondo
 * (subir, encajar cover/contain, centrar).
 *
 * Cómo lo hará:
 *  - Lee `size`, `activePresetId` e `image` del store.
 *  - Al pulsar un preset (de presets.ts) llama a `setSize(size, presetId)`.
 *  - Al teclear, `setSize({ width, height })` con presetId 'custom', validando
 *    con clamp para no permitir valores absurdos.
 */

export const SizePanel = () => {
  return <section data-panel="size" />;
};
