/**
 * CONTRATO · platform/files (web ↔ Capacitor)
 * -------------------------------------------
 * Abstrae la ENTREGA de ficheros para que el resto de la app no dependa de si
 * corre en navegador o como app nativa. El código de export llama siempre a
 * `saveFile(blob, fileName)` y esta capa elige la implementación correcta.
 *
 * Cómo lo hará:
 *  - Web: usa utils/download (enlace temporal). Ya operativo.
 *  - Nativo (Capacitor): detecta la plataforma y usa el plugin Filesystem/Share
 *    para guardar o compartir el fichero. Punto único de divergencia por
 *    plataforma, para mantener el resto del código agnóstico.
 */

import { downloadBlob } from '@/utils/download';

export async function saveFile(blob: Blob, fileName: string): Promise<void> {
  // TODO(equipo): en Capacitor, derivar a Filesystem/Share según plataforma.
  // Por ahora, la vía web cubre el desarrollo y la PWA.
  downloadBlob(blob, fileName);
}
