/**
 * CONTRATO · ExportDialog (diálogo de exportación)
 * ------------------------------------------------
 * Permite elegir el formato de salida (PNG/JPEG/WebP/PDF), muestra la
 * resolución real y lanza la descarga SIN pérdida de calidad respecto al
 * original.
 *
 * Cómo lo hará:
 *  - Lee `size` y `exportFormat` del store; permite cambiar el formato.
 *  - Al exportar: espera a que las fuentes estén listas (useFontLoader),
 *    llama a core/renderToCanvas (resolución real) → core/exporters (formato) →
 *    entrega el Blob vía platform/files (web: download; nativo: Capacitor).
 */

export function ExportDialog() {
  return <section data-panel="export" />;
}
