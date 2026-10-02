import { crc32, deflateSync, inflateSync } from "node:zlib";

// PNG RGB sin dependencias para los fixtures. color(x, y) -> [r, g, b].
export function makePng(w: number, h: number, color: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y);
      raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Cuadrantes de color: rojo, verde / azul, amarillo.
export const quadrants = (w: number, h: number) =>
  makePng(w, h, (x, y) => (y < h / 2 ? (x < w / 2 ? [220, 30, 30] : [30, 200, 30]) : x < w / 2 ? [30, 30, 220] : [230, 220, 30]));

// Decodificador PNG mínimo (8 bits, RGB o RGBA, sin entrelazado) para comprobar píxeles exportados.
export function decodePng(buf: Buffer): { width: number; height: number; px: (x: number, y: number) => [number, number, number, number] } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("no es un PNG");
  let off = 8;
  let width = 0, height = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9]!;
      if (data[8] !== 8 || data[12] !== 0) throw new Error("PNG no soportado por el decodificador de pruebas");
    } else if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`tipo de color ${colorType} no soportado`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp]! : 0;
      let v = row[i]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return {
    width, height,
    px: (x, y) => {
      const o = y * stride + x * bpp;
      return [out[o]!, out[o + 1]!, out[o + 2]!, bpp === 4 ? out[o + 3]! : 255];
    },
  };
}
