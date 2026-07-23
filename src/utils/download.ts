/**
 * CONTRATO · download
 * -------------------
 * Dispara la descarga de un Blob en el navegador con un nombre de fichero dado.
 * En web crea un enlace temporal y lo revoca. En nativo (Capacitor) la entrega
 * del fichero la resuelve `platform/files.ts`; este util es la vía web pura.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
