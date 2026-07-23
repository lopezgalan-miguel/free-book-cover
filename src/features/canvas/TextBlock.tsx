/**
 * CONTRATO · TextBlock (bloque de texto en el preview)
 * ----------------------------------------------------
 * Renderiza UN bloque (`TextBlock` del modelo) dentro del Stage: aplica su
 * tipografía, tamaño, color, alineación, sombra, contorno y curvatura, y lo
 * posiciona por porcentaje. Es arrastrable (useDrag) y seleccionable.
 *
 * Cómo lo hará:
 *  - Recibe el bloque, el ancho en px del lienzo escalado (para traducir el
 *    tamaño de fuente en %) y si está seleccionado.
 *  - Si `curve === 0` pinta texto normal; si no, delega en core/curvedText para
 *    la geometría y lo pinta como SVG <textPath>.
 *  - No muta el store directamente: notifica selección/arrastre hacia arriba.
 *
 * Componente puramente de presentación y reutilizable.
 */

import type { TextBlock as TextBlockModel } from '@/types/editor';

export interface TextBlockProps {
  block: TextBlockModel;
  /** Ancho del lienzo escalado en pantalla, en px (para el tamaño de fuente). */
  canvasWidthPx: number;
  selected: boolean;
}

export function TextBlock(_props: TextBlockProps) {
  return null;
}
