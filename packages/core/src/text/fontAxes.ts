// Ejes de variación de una fuente (tabla fvar de OpenType). Solo TTF/OTF sin comprimir: en WOFF2 las
// tablas van comprimidas con Brotli y se devuelve null (la fuente se usa igual, sin ejes elegibles).
export interface FontAxis {
  tag: string;
  min: number;
  def: number;
  max: number;
}

export function readFontAxes(bytes: Uint8Array): FontAxis[] | null {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = dv.getUint32(0);
    // 0x00010000 (TrueType), 'OTTO' (CFF) o 'true' (TrueType de Apple).
    if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;
    const numTables = dv.getUint16(4);
    const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      if (tag(rec) !== "fvar") continue;
      const f = dv.getUint32(rec + 8);
      const axesOffset = dv.getUint16(f + 4);
      const count = dv.getUint16(f + 8);
      const size = dv.getUint16(f + 10);
      const fixed = (o: number) => Math.round((dv.getInt32(o) / 65536) * 1000) / 1000;
      return Array.from({ length: count }, (_, k) => {
        const o = f + axesOffset + k * size;
        return { tag: tag(o), min: fixed(o + 4), def: fixed(o + 8), max: fixed(o + 12) };
      });
    }
    return null;
  } catch {
    // Datos truncados: DataView lanza RangeError.
    return null;
  }
}
