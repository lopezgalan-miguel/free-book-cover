// Separa una colección TrueType (.ttc) en fuentes sueltas: cada cara se reconstruye como un sfnt
// independiente (directorio de tablas nuevo, tablas copiadas y alineadas a 4 bytes, suma de
// comprobación de `head` recalculada) para poder registrarla como una fuente subida más.
export const MAX_COLLECTION_FACES = 16;

export interface CollectionFace {
  bytes: Uint8Array;
  format: "ttf" | "otf";
  family: string;
  subfamily: string;
  weight: number;
  italic: boolean;
}

export type SplitFontCollectionResult =
  | { ok: true; faces: CollectionFace[] }
  | { ok: false; reason: "not_collection" | "too_many" | "corrupt" };

const TTCF = 0x74746366;
const OTTO = 0x4f54544f;
const CHECKSUM_MAGIC = 0xb1b0afba;

export function isFontCollection(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 && bytes[0] === 0x74 && bytes[1] === 0x74 && bytes[2] === 0x63 && bytes[3] === 0x66
  );
}

function sum32(b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < b.length; i += 4) {
    const w = (b[i]! * 0x1000000 + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0)) >>> 0;
    s = (s + w) >>> 0;
  }
  return s;
}

interface TableRecord {
  tag: string;
  checksum: number;
  data: Uint8Array;
}

export function splitFontCollection(bytes: Uint8Array): SplitFontCollectionResult {
  if (!isFontCollection(bytes)) return { ok: false, reason: "not_collection" };
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0) !== TTCF) return { ok: false, reason: "not_collection" };
    const numFonts = dv.getUint32(8);
    if (numFonts > MAX_COLLECTION_FACES) return { ok: false, reason: "too_many" };
    if (numFonts === 0) return { ok: false, reason: "corrupt" };
    const faces: CollectionFace[] = [];
    for (let i = 0; i < numFonts; i++) {
      const face = rebuildFace(bytes, dv, dv.getUint32(12 + i * 4));
      if (!face) return { ok: false, reason: "corrupt" };
      faces.push(face);
    }
    return { ok: true, faces };
  } catch {
    // Datos truncados: DataView lanza RangeError.
    return { ok: false, reason: "corrupt" };
  }
}

function rebuildFace(bytes: Uint8Array, dv: DataView, dirOffset: number): CollectionFace | null {
  if (dirOffset + 12 > bytes.length) return null;
  const sfntVersion = dv.getUint32(dirOffset);
  const numTables = dv.getUint16(dirOffset + 4);
  if (numTables === 0 || dirOffset + 12 + numTables * 16 > bytes.length) return null;

  const records: TableRecord[] = [];
  for (let i = 0; i < numTables; i++) {
    const r = dirOffset + 12 + i * 16;
    const offset = dv.getUint32(r + 8);
    const length = dv.getUint32(r + 12);
    if (offset + length > bytes.length) return null;
    records.push({
      tag: String.fromCharCode(bytes[r]!, bytes[r + 1]!, bytes[r + 2]!, bytes[r + 3]!),
      checksum: dv.getUint32(r + 4),
      data: bytes.slice(offset, offset + length),
    });
  }

  // `head` lleva checkSumAdjustment a 0 al calcular su suma y la del archivo.
  const head = records.find((t) => t.tag === "head");
  if (head && head.data.length >= 12) {
    head.data.fill(0, 8, 12);
    head.checksum = sum32(head.data);
  }

  const headerLen = 12 + numTables * 16;
  let pos = headerLen;
  const offsets = records.map((t) => {
    const at = pos;
    pos += (t.data.length + 3) & ~3;
    return at;
  });
  const out = new Uint8Array(pos);
  const odv = new DataView(out.buffer);
  const log2 = Math.floor(Math.log2(numTables));
  const searchRange = 16 * 2 ** log2;
  odv.setUint32(0, sfntVersion);
  odv.setUint16(4, numTables);
  odv.setUint16(6, searchRange);
  odv.setUint16(8, log2);
  odv.setUint16(10, numTables * 16 - searchRange);
  records.forEach((t, i) => {
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = t.tag.charCodeAt(k);
    odv.setUint32(r + 4, t.checksum);
    odv.setUint32(r + 8, offsets[i]!);
    odv.setUint32(r + 12, t.data.length);
    out.set(t.data, offsets[i]!);
  });
  if (head && head.data.length >= 12) {
    const at = offsets[records.indexOf(head)]!;
    odv.setUint32(at + 8, (CHECKSUM_MAGIC - sum32(out)) >>> 0);
  }

  const table = (tag: string) => records.find((t) => t.tag === tag)?.data;
  const os2 = table("OS/2");
  const headData = table("head");
  const os2dv = os2 && os2.length >= 64 ? new DataView(os2.buffer, os2.byteOffset, os2.byteLength) : null;
  const headdv = headData && headData.length >= 46 ? new DataView(headData.buffer, headData.byteOffset, headData.byteLength) : null;
  const weight = os2dv ? os2dv.getUint16(4) : 400;
  const italic = (os2dv ? (os2dv.getUint16(62) & 1) !== 0 : false) || (headdv ? (headdv.getUint16(44) & 2) !== 0 : false);
  const names = readNames(table("name"));
  return {
    bytes: out,
    format: sfntVersion === OTTO ? "otf" : "ttf",
    family: names.get(16) ?? names.get(1) ?? "",
    subfamily: names.get(17) ?? names.get(2) ?? "",
    weight,
    italic,
  };
}

// nameID -> texto; prefiere plataforma 3 (UTF-16BE, idioma 0x409 si hay varios) y, si no, plataforma 1.
function readNames(name: Uint8Array | undefined): Map<number, string> {
  const result = new Map<number, string>();
  if (!name || name.length < 6) return result;
  try {
    const dv = new DataView(name.buffer, name.byteOffset, name.byteLength);
    const count = dv.getUint16(2);
    const strOff = dv.getUint16(4);
    const best = new Map<number, { rank: number; text: string }>();
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12;
      const platform = dv.getUint16(r);
      if (platform !== 1 && platform !== 3) continue;
      const lang = dv.getUint16(r + 4);
      const id = dv.getUint16(r + 6);
      const len = dv.getUint16(r + 8);
      const start = strOff + dv.getUint16(r + 10);
      if (start + len > name.length) continue;
      let text = "";
      if (platform === 3) {
        for (let k = 0; k + 1 < len; k += 2) text += String.fromCharCode(dv.getUint16(start + k));
      } else {
        for (let k = 0; k < len; k++) text += String.fromCharCode(name[start + k]!);
      }
      const rank = platform === 3 ? (lang === 0x409 ? 3 : 2) : 1;
      if (!best.has(id) || best.get(id)!.rank < rank) best.set(id, { rank, text });
    }
    for (const [id, v] of best) result.set(id, v.text);
  } catch {
    // name corrupta: se devuelve lo leído hasta ahora.
  }
  return result;
}
