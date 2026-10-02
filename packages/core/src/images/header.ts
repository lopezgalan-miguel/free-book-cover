// Lectura de cabeceras de imagen sin decodificar (SDD §6: el límite de 80 Mpx
// debe comprobarse antes de decodificar). Solo PNG, JPEG, WebP y GIF.
export type ImageFormat = "png" | "jpeg" | "webp" | "gif";
export interface ImageHeader {
  format: ImageFormat;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  // Orientación EXIF (2-8); ausente si es 1. widthPx/heightPx ya están en orientación de visualización.
  orientation?: number;
}

const MIME: Record<ImageFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const ascii = (b: Uint8Array, at: number, s: string) => s.length + at <= b.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);

function done(format: ImageFormat, widthPx: number, heightPx: number, orientation = 1): ImageHeader | null {
  if (!(widthPx > 0 && heightPx > 0)) return null;
  // Orientaciones 5-8 giran 90º: el navegador decodifica con ancho y alto intercambiados.
  const swap = orientation >= 5 && orientation <= 8;
  return { format, mimeType: MIME[format], widthPx: swap ? heightPx : widthPx, heightPx: swap ? widthPx : heightPx, ...(orientation > 1 ? { orientation } : {}) };
}

// Orientación del segmento APP1 Exif (data = bytes tras el marcador y la longitud); 1 si no consta.
function exifOrientation(b: Uint8Array, at: number, end: number): number {
  if (!ascii(b, at, "Exif\0\0")) return 1;
  const t = at + 6;
  const le = ascii(b, t, "II");
  if (!le && !ascii(b, t, "MM")) return 1;
  const r16 = (o: number) => (le ? u16le(b, o) : u16be(b, o));
  const r32 = (o: number) => (le ? (u16le(b, o) | (u16le(b, o + 2) << 16)) >>> 0 : ((u16be(b, o) << 16) | u16be(b, o + 2)) >>> 0);
  if (t + 8 > end) return 1;
  const ifd = t + r32(t + 4);
  if (ifd + 2 > end) return 1;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) return 1;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function png(b: Uint8Array): ImageHeader | null {
  if (b.length < 24 || !ascii(b, 12, "IHDR")) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return done("png", dv.getUint32(16), dv.getUint32(20));
}

function jpeg(b: Uint8Array): ImageHeader | null {
  let i = 2;
  let orientation = 1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1]!;
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // fin o datos de imagen sin SOF
    const len = u16be(b, i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (marker === 0xe1) orientation = exifOrientation(b, i + 4, Math.min(b.length, i + 2 + len));
    if (isSof) return i + 9 <= b.length ? done("jpeg", u16be(b, i + 7), u16be(b, i + 5), orientation) : null;
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webp(b: Uint8Array): ImageHeader | null {
  if (b.length < 25) return null;
  if (ascii(b, 12, "VP8 ")) return b.length < 30 ? null : done("webp", u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (ascii(b, 12, "VP8L")) {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return done("webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (ascii(b, 12, "VP8X")) return b.length < 30 ? null : done("webp", u24le(b, 24) + 1, u24le(b, 27) + 1);
  return null;
}

// Devuelve null si el formato no se reconoce o la cabecera está truncada.
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, "PNG")) return png(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return webp(bytes);
  if (ascii(bytes, 0, "GIF8") && bytes.length >= 10) return done("gif", u16le(bytes, 6), u16le(bytes, 8));
  return null;
}
