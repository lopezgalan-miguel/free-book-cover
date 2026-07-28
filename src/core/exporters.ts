/**
 * CONTRATO · exporters
 * --------------------
 * Convierte el canvas ya rasterizado (`renderToCanvas`) al formato elegido por
 * el usuario, cuidando la calidad. Cada exportador recibe el canvas y devuelve
 * un Blob listo para descargar/compartir.
 *
 * Cómo lo hace:
 *  - PNG  → `canvas.toBlob('image/png')`, sin pérdida y sin calidad que elegir.
 *  - JPEG → `image/jpeg` con la calidad que pide el usuario (por defecto 0.92).
 *  - WebP → `image/webp` con esa misma calidad.
 *  - PDF  → una página del tamaño del lienzo a 300 DPI con la imagen embebida.
 *
 * El PDF se escribe A MANO, sin librería: el documento que hace falta es una
 * página con una sola imagen, y el fichero completo son seis objetos. Traer una
 * dependencia de cientos de KB al bundle de una PWA para esto no sale a cuenta.
 * Los píxeles van en RGB comprimidos con `CompressionStream('deflate')`, que
 * produce exactamente el formato que espera `/FlateDecode`: el PDF conserva el
 * píxel exacto del canvas. Si el navegador no trae `CompressionStream` se cae a
 * JPEG dentro del PDF (`/DCTDecode`), que es la única alternativa razonable a
 * meter 12 MB de mapa de bits sin comprimir.
 *
 * `exportCanvas` es el punto de entrada único: recibe formato + canvas y
 * delega en el exportador correspondiente. El nombre de fichero y la entrega
 * (web vs. Capacitor) los resuelve la capa que llama, no esta.
 */

import type { ExportFormat } from '@/types/editor';

/** Calidad por defecto de los formatos con pérdida (JPEG/WebP). */
export const DEFAULT_QUALITY = 0.92;

/** Resolución que se le supone al lienzo al llevarlo a una página de PDF. */
const PDF_DPI = 300;
/** Puntos PostScript por pulgada: la unidad del PDF. */
const POINTS_PER_INCH = 72;

const MIME_BY_FORMAT: Record<Exclude<ExportFormat, 'PDF'>, string> = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  WebP: 'image/webp',
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`exportCanvas: el navegador no ha sabido generar ${type}`));
      },
      type,
      quality,
    );
  });

/** Bytes RGB del canvas, sin el canal alfa (el lienzo se pinta siempre opaco). */
const rgbBytesOf = (canvas: HTMLCanvasElement): Uint8Array<ArrayBuffer> => {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('exportCanvas: el navegador no da contexto 2D');

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let pixel = 0, target = 0; pixel < data.length; pixel += 4, target += 3) {
    rgb[target] = data[pixel];
    rgb[target + 1] = data[pixel + 1];
    rgb[target + 2] = data[pixel + 2];
  }
  return rgb;
};

const deflate = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(compressed);
};

/**
 * Datos de la imagen del PDF y el filtro con el que van escritos. Flate
 * conserva el píxel; DCT (JPEG) es el respaldo cuando no hay compresión nativa.
 */
const pdfImageData = async (
  canvas: HTMLCanvasElement,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; filter: string }> => {
  if (typeof CompressionStream === 'undefined') {
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.95);
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), filter: '/DCTDecode' };
  }
  return { bytes: await deflate(rgbBytesOf(canvas)), filter: '/FlateDecode' };
};

const encodeAscii = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);

/**
 * Ensambla el PDF. La tabla `xref` obliga a conocer el desplazamiento en BYTES
 * de cada objeto, así que el fichero se construye por trozos llevando la cuenta
 * a medida que se añaden (no vale medir la cadena al final: el flujo de imagen
 * es binario y no cabe en un string).
 */
const buildPdf = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const { bytes: imageBytes, filter } = await pdfImageData(canvas);

  const pageWidth = (canvas.width * POINTS_PER_INCH) / PDF_DPI;
  const pageHeight = (canvas.height * POINTS_PER_INCH) / PDF_DPI;
  const content = `q ${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q\n`;

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (data: Uint8Array<ArrayBuffer> | string) => {
    const bytes = typeof data === 'string' ? encodeAscii(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };

  /** Abre un objeto anotando dónde empieza, que es lo que pide la `xref`. */
  const openObject = (id: number, dictionary: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${dictionary}`);
  };

  /**
   * Objeto con flujo. Los separadores van EXACTOS: `/Length` cuenta los bytes
   * que hay entre el salto que sigue a `stream` y el que precede a
   * `endstream`. Un byte de más aquí desplaza todo el flujo y el lector
   * descarta la imagen (el PDF abre, pero sale en blanco).
   */
  const pushStreamObject = (id: number, dictionary: string, data: Uint8Array<ArrayBuffer>) => {
    openObject(id, dictionary);
    push('\nstream\n');
    push(data);
    push('\nendstream\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  openObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  push('\nendobj\n');

  openObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  push('\nendobj\n');

  openObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(
      2,
    )}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  push('\nendobj\n');

  pushStreamObject(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${imageBytes.length} >>`,
    imageBytes,
  );

  pushStreamObject(5, `<< /Length ${content.length} >>`, encodeAscii(content));

  const xrefOffset = length;
  const entry = (offset: number) => `${String(offset).padStart(10, '0')} 00000 n \n`;
  push(
    `xref\n0 6\n0000000000 65535 f \n${entry(offsets[1])}${entry(offsets[2])}${entry(
      offsets[3],
    )}${entry(offsets[4])}${entry(offsets[5])}`,
  );
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
};

/**
 * Serializa el canvas al formato pedido. `quality` (0–1) solo la usan JPEG y
 * WebP; PNG y PDF la ignoran porque no pierden nada que ajustar.
 */
export const exportCanvas = async (
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality: number = DEFAULT_QUALITY,
): Promise<Blob> => {
  if (format === 'PDF') return buildPdf(canvas);
  if (format === 'PNG') return toBlob(canvas, MIME_BY_FORMAT.PNG);
  return toBlob(canvas, MIME_BY_FORMAT[format], quality);
};

/** Extensión de fichero de cada formato, para nombrar la descarga. */
export const extensionOf = (format: ExportFormat): string =>
  format === 'JPEG' ? 'jpg' : format.toLowerCase();
