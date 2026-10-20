import { describe, expect, it } from "vitest";
import { isFontCollection, MAX_COLLECTION_FACES, splitFontCollection } from "../src/index.js";

type Tables = Record<string, Uint8Array>;

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function sum32(b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < b.length; i += 4) {
    const w = ((b[i] ?? 0) * 0x1000000 + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0)) >>> 0;
    s = (s + w) >>> 0;
  }
  return s;
}

function head(italic: boolean): Uint8Array {
  const b = new Uint8Array(54);
  new DataView(b.buffer).setUint16(44, italic ? 2 : 0);
  return b;
}

function os2(weight: number, fsSelection: number): Uint8Array {
  const b = new Uint8Array(78);
  const dv = new DataView(b.buffer);
  dv.setUint16(4, weight);
  dv.setUint16(62, fsSelection);
  return b;
}

// Tabla name con registros [plataforma, idioma, nameID, texto].
function nameTable(recs: Array<[number, number, number, string]>): Uint8Array {
  const strs = recs.map(([p, , , t]) => {
    if (p === 1) return ascii(t);
    const u = new Uint8Array(t.length * 2);
    for (let i = 0; i < t.length; i++) new DataView(u.buffer).setUint16(i * 2, t.charCodeAt(i));
    return u;
  });
  const strOff = 6 + recs.length * 12;
  const total = strs.reduce((a, s) => a + s.length, 0);
  const out = new Uint8Array(strOff + total);
  const dv = new DataView(out.buffer);
  dv.setUint16(2, recs.length);
  dv.setUint16(4, strOff);
  let off = 0;
  recs.forEach(([p, lang, id], i) => {
    const r = 6 + i * 12;
    dv.setUint16(r, p);
    dv.setUint16(r + 2, p === 3 ? 1 : 0);
    dv.setUint16(r + 4, lang);
    dv.setUint16(r + 6, id);
    dv.setUint16(r + 8, strs[i]!.length);
    dv.setUint16(r + 10, off);
    out.set(strs[i]!, strOff + off);
    off += strs[i]!.length;
  });
  return out;
}

interface FontSpec {
  version?: number;
  tables: Tables;
}

const pad4 = (n: number) => (n + 3) & ~3;

// Construye una colección: las tablas de cada cara se colocan tras todos los directorios, con
// desplazamientos desde el inicio del archivo.
function buildTtc(fonts: FontSpec[], overrideOffsets?: number[]): Uint8Array {
  const headerLen = 12 + fonts.length * 4;
  const dirLens = fonts.map((f) => 12 + Object.keys(f.tables).length * 16);
  const dirStarts: number[] = [];
  let pos = headerLen;
  for (const l of dirLens) {
    dirStarts.push(pos);
    pos += l;
  }
  const chunks: Array<{ at: number; data: Uint8Array }> = [];
  const dirs = fonts.map((f, fi) => {
    const tags = Object.keys(f.tables);
    const dir = new Uint8Array(dirLens[fi]!);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, f.version ?? 0x00010000);
    dv.setUint16(4, tags.length);
    tags.forEach((t, i) => {
      const data = f.tables[t]!;
      pos = pad4(pos);
      const r = 12 + i * 16;
      dir.set(ascii(t), r);
      dv.setUint32(r + 4, sum32(data));
      dv.setUint32(r + 8, pos);
      dv.setUint32(r + 12, data.length);
      chunks.push({ at: pos, data });
      pos += data.length;
    });
    return dir;
  });
  const out = new Uint8Array(pad4(pos));
  const dv = new DataView(out.buffer);
  out.set(ascii("ttcf"), 0);
  dv.setUint16(4, 1);
  dv.setUint32(8, fonts.length);
  fonts.forEach((_, i) => dv.setUint32(12 + i * 4, overrideOffsets?.[i] ?? dirStarts[i]!));
  dirs.forEach((d, i) => out.set(d, dirStarts[i]!));
  for (const c of chunks) out.set(c.data, c.at);
  return out;
}

// sfnt independiente (para probar not_collection).
function buildSfnt(tables: Tables): Uint8Array {
  const n = Object.keys(tables).length;
  let pos = 12 + n * 16;
  const out = new Uint8Array(pos + Object.values(tables).reduce((a, t) => a + pad4(t.length), 0));
  const odv = new DataView(out.buffer);
  odv.setUint32(0, 0x00010000);
  odv.setUint16(4, n);
  Object.entries(tables).forEach(([t, d], i) => {
    out.set(ascii(t), 12 + i * 16);
    odv.setUint32(12 + i * 16 + 8, pos);
    odv.setUint32(12 + i * 16 + 12, d.length);
    out.set(d, pos);
    pos += pad4(d.length);
  });
  return out;
}

const regular: Tables = {
  head: head(false),
  "OS/2": os2(400, 0),
  name: nameTable([
    [3, 0x409, 1, "Prueba"],
    [3, 0x409, 2, "Regular"],
  ]),
};
const boldItalic: Tables = {
  head: head(false),
  "OS/2": os2(700, 1),
  name: nameTable([
    [1, 0, 1, "Prueba"],
    [1, 0, 2, "Bold Italic"],
  ]),
};

function tableOf(face: Uint8Array, tag: string): Uint8Array | null {
  const dv = new DataView(face.buffer, face.byteOffset, face.byteLength);
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    if (String.fromCharCode(...face.subarray(r, r + 4)) === tag)
      return face.subarray(dv.getUint32(r + 8), dv.getUint32(r + 8) + dv.getUint32(r + 12));
  }
  return null;
}

describe("splitFontCollection", () => {
  const ttc = buildTtc([{ tables: regular }, { tables: boldItalic }]);

  it("separa dos caras con sus nombres, peso y cursiva", () => {
    expect(isFontCollection(ttc)).toBe(true);
    const r = splitFontCollection(ttc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.faces).toHaveLength(2);
    expect(r.faces[0]).toMatchObject({ family: "Prueba", subfamily: "Regular", weight: 400, italic: false, format: "ttf" });
    expect(r.faces[1]).toMatchObject({ family: "Prueba", subfamily: "Bold Italic", weight: 700, italic: true });
  });

  it("cada cara es un sfnt independiente con tablas idénticas y alineadas", () => {
    const r = splitFontCollection(ttc);
    if (!r.ok) throw new Error("no ok");
    const specs = [regular, boldItalic];
    r.faces.forEach((f, i) => {
      const dv = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
      expect(dv.getUint32(0)).toBe(0x00010000);
      const n = dv.getUint16(4);
      expect(n).toBe(3);
      for (let k = 0; k < n; k++) {
        const off = dv.getUint32(12 + k * 16 + 8);
        const len = dv.getUint32(12 + k * 16 + 12);
        expect(off % 4).toBe(0);
        expect(off + len).toBeLessThanOrEqual(f.bytes.length);
      }
      for (const [tag, orig] of Object.entries(specs[i]!)) {
        const t = tableOf(f.bytes, tag)!;
        if (tag === "head") {
          // Solo difiere checkSumAdjustment (offset 8).
          expect(Array.from(t.subarray(0, 8))).toEqual(Array.from(orig.subarray(0, 8)));
          expect(Array.from(t.subarray(12))).toEqual(Array.from(orig.subarray(12)));
        } else {
          expect(Array.from(t)).toEqual(Array.from(orig));
        }
      }
      expect(sum32(f.bytes)).toBe(0xb1b0afba);
    });
  });

  it("una cara OTTO es otf", () => {
    const r = splitFontCollection(buildTtc([{ version: 0x4f54544f, tables: regular }]));
    if (!r.ok) throw new Error("no ok");
    expect(r.faces[0]!.format).toBe("otf");
    expect(new DataView(r.faces[0]!.bytes.buffer, r.faces[0]!.bytes.byteOffset).getUint32(0)).toBe(0x4f54544f);
  });

  it("17 caras: too_many", () => {
    const many = buildTtc(Array.from({ length: MAX_COLLECTION_FACES + 1 }, () => ({ tables: regular })));
    expect(splitFontCollection(many)).toEqual({ ok: false, reason: "too_many" });
  });

  it("desplazamiento fuera del archivo: corrupt", () => {
    const bad = buildTtc([{ tables: regular }], [999999]);
    expect(splitFontCollection(bad)).toEqual({ ok: false, reason: "corrupt" });
    expect(splitFontCollection(ttc.subarray(0, 30))).toEqual({ ok: false, reason: "corrupt" });
  });

  it("un ttf normal: not_collection", () => {
    const ttf = buildSfnt(regular);
    expect(isFontCollection(ttf)).toBe(false);
    expect(splitFontCollection(ttf)).toEqual({ ok: false, reason: "not_collection" });
  });
});
