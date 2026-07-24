/**
 * CONTRATO · renderToCanvas
 * -------------------------
 * Pinta el proyecto (imagen de fondo + todos los bloques de texto) sobre un
 * <canvas> a la RESOLUCIÓN REAL de salida (`size` en px), no a la del preview.
 * Es la pieza clave de "exportar sin perder calidad": el preview en pantalla es
 * una vista escalada; la exportación se rasteriza aquí a tamaño completo.
 *
 * Cómo lo hará:
 *  1. Crea un canvas de `size.width × size.height`.
 *  2. Dibuja la imagen de fondo respetando `fit`/offset (cover/contain).
 *  3. Recorre `blocks` y pinta cada uno con su tipografía, color, sombra,
 *     contorno y alineación. El texto curvo delega en `curvedText.ts`.
 *  4. Convierte % → px usando el ancho real, de modo que el resultado sea
 *     idéntico proporcionalmente a lo que se ve en el preview.
 *
 * Requisito: las fuentes usadas deben estar ya cargadas (`document.fonts.ready`)
 * antes de llamar, o el texto se pintará con una fuente de sustitución.
 *
 * Devuelve el HTMLCanvasElement listo para que `exporters.ts` lo serialice.
 */

import type { EditorState } from '@/types/editor';

export interface RenderInput {
  blocks: EditorState['blocks'];
  image: EditorState['image'];
  size: EditorState['size'];
}

export const renderToCanvas = async (renderInput: RenderInput): Promise<HTMLCanvasElement> => {
  void renderInput; // stub: la firma ya es definitiva, el cuerpo llega en la Fase 4
  throw new Error('renderToCanvas: pendiente de implementar');
};
