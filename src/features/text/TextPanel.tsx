/**
 * CONTRATO · TextPanel (panel de texto y estilo)
 * ----------------------------------------------
 * Edita el CONTENIDO y el ESTILO del bloque seleccionado: el textarea (con
 * preview en tiempo real), negrita/cursiva/subrayado/mayúsculas, alineación,
 * y los sliders de tamaño, interlineado, espaciado y curvatura, más los toggles
 * de sombra y contorno. También gestiona la lista de capas (añadir/eliminar).
 *
 * Cómo lo hará:
 *  - Lee el bloque seleccionado del store y muta con `patchSelected`.
 *  - Se apoya en primitivas reutilizables (Slider, Toggle) de sharedComponents.
 *  - Si no hay selección, muestra un estado vacío invitando a añadir una capa.
 */

export const TextPanel = () => {
  return <section data-panel="text" />;
};
