/**
 * CONTRATO · Stage (escenario del lienzo)
 * ---------------------------------------
 * Es el PREVIEW en tiempo real. Muestra el lienzo escalado para caber en
 * pantalla (manteniendo la proporción real `size`), pinta la imagen de fondo y
 * renderiza cada bloque con <TextBlock>. Refleja al instante cualquier cambio
 * del store (texto, fuente, color, estilo) — como una story de Instagram.
 *
 * Cómo lo hará:
 *  - Lee `blocks`, `image`, `size` y `selectedBlockId` del editorStore.
 *  - Calcula un factor de escala (px reales → px de pantalla) y posiciona los
 *    bloques por porcentaje, de modo que el preview sea fiel a la exportación.
 *  - Gestiona la selección (tocar un bloque lo selecciona) y el arrastre del
 *    fondo, delegando el arrastre de bloques en <TextBlock> + useDrag.
 *
 * Responsivo: ocupa el espacio disponible y centra el lienzo. Solo preview;
 * la rasterización final es de core/renderToCanvas, no de aquí.
 */

export const Stage = () => {
  return <div data-stage className="relative flex-1" />;
};
