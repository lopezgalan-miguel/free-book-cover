/**
 * CONTRATO · exporters
 * --------------------
 * Convierte el canvas ya rasterizado (`renderToCanvas`) al formato elegido por
 * el usuario, cuidando la calidad. Cada exportador recibe el canvas y devuelve
 * un Blob listo para descargar/compartir.
 *
 * Cómo lo hará:
 *  - PNG  → `canvas.toBlob('image/png')`, sin pérdida.
 *  - JPEG → `image/jpeg` con calidad alta (≈0.92), pensado para KDP.
 *  - WebP → `image/webp` con buena relación calidad/peso.
 *  - PDF  → embebe la imagen a 300 DPI en una página del tamaño del lienzo.
 *
 * `exportCanvas` es el punto de entrada único: recibe formato + canvas y
 * delega en el exportador correspondiente. El nombre de fichero y la entrega
 * (web vs. Capacitor) los resuelve la capa que llama, no esta.
 */

import type { ExportFormat } from '@/types/editor';

export async function exportCanvas(
  _canvas: HTMLCanvasElement,
  _format: ExportFormat,
): Promise<Blob> {
  // TODO(equipo): serializar según el formato manteniendo la calidad.
  throw new Error('exportCanvas: pendiente de implementar');
}
