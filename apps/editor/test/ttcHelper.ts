// Constructor de colecciones .ttc mínimas para las pruebas del editor (copia del de core/test/fontCollection.test.ts).
export type Tables = Record<string, Uint8Array>;

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

export interface FontSpec {
  version?: number;
  tables: Tables;
}

const pad4 = (n: number) => (n + 3) & ~3;

// Construye una colección: las tablas de cada cara se colocan tras todos los directorios, con
// desplazamientos desde el inicio del archivo.
export function buildTtc(fonts: FontSpec[]): Uint8Array {
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
  fonts.forEach((_, i) => dv.setUint32(12 + i * 4, dirStarts[i]!));
  dirs.forEach((d, i) => out.set(d, dirStarts[i]!));
  for (const c of chunks) out.set(c.data, c.at);
  return out;
}

export const regular: Tables = {
  head: head(false),
  "OS/2": os2(400, 0),
  name: nameTable([
    [3, 0x409, 1, "Prueba"],
    [3, 0x409, 2, "Regular"],
  ]),
};
export const boldItalic: Tables = {
  head: head(false),
  "OS/2": os2(700, 1),
  name: nameTable([
    [1, 0, 1, "Prueba"],
    [1, 0, 2, "Bold Italic"],
  ]),
};

