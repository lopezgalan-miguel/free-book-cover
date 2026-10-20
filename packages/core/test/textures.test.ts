import { describe, expect, it } from "vitest";
import { TEXTURE_DEFAULTS, TEXTURE_KINDS, generateTexture, textureSampler } from "../src/index.js";

const SIZE = 256;
const transparent = (d: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] === 0) n++;
  return n / (d.length / 4);
};

describe("generateTexture", () => {
  it("es determinista: misma semilla, mismos bytes; otra semilla, otros", () => {
    const a = generateTexture({ kind: "cracked-marble", seed: 7, sizePx: SIZE });
    const b = generateTexture({ kind: "cracked-marble", seed: 7, sizePx: SIZE });
    const c = generateTexture({ kind: "cracked-marble", seed: 8, sizePx: SIZE });
    expect(a.widthPx).toBe(SIZE);
    expect(a.data.length).toBe(SIZE * SIZE * 4);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });
  for (const kind of TEXTURE_KINDS) {
    it(`${kind}: empalma sin costura (el píxel siguiente al borde es el primero)`, () => {
      const { size, sample } = textureSampler({ kind, seed: 3, sizePx: SIZE });
      const a = [0, 0, 0, 0];
      const b = [0, 0, 0, 0];
      let mismatches = 0;
      for (let k = 0; k < size; k++) {
        for (const [p, q] of [[[size, k], [0, k]], [[k, size], [k, 0]], [[-1, k], [size - 1, k]]] as const) {
          sample(p[0], p[1], a, 0);
          sample(q[0], q[1], b, 0);
          if (a.some((v, c) => Math.abs(v - b[c]!) > 2)) mismatches++;
        }
      }
      // Tolerancia para empates de coma flotante en el borde de una grieta.
      expect(mismatches).toBeLessThanOrEqual(Math.ceil(size * 3 * 0.005));
    });
  }
  it("mármol con huecos: las grietas son transparentes; con líneas, todo es opaco", () => {
    const holes = transparent(generateTexture({ kind: "cracked-marble", seed: 1, sizePx: SIZE, cracks: "holes" }).data);
    expect(holes).toBeGreaterThan(0.02);
    expect(holes).toBeLessThan(0.25);
    expect(transparent(generateTexture({ kind: "cracked-marble", seed: 1, sizePx: SIZE, cracks: "lines" }).data)).toBe(0);
    expect(transparent(generateTexture({ kind: "stone", seed: 1, sizePx: SIZE }).data)).toBe(0);
  });
  it("con líneas, las grietas toman el color pedido", () => {
    const t = generateTexture({ kind: "cracked-marble", seed: 1, sizePx: 128, cracks: "lines", crackColor: "#b4141e" });
    let n = 0;
    for (let i = 0; i < t.data.length; i += 4) if (t.data[i] === 0xb4 && t.data[i + 1] === 0x14 && t.data[i + 2] === 0x1e) n++;
    expect(n / (t.data.length / 4)).toBeGreaterThan(0.02);
  });
  it("rechaza tamaños fuera de 64..2048 y tipos desconocidos", () => {
    expect(() => generateTexture({ kind: "stone", seed: 1, sizePx: 32 })).toThrow(RangeError);
    expect(() => generateTexture({ kind: "stone", seed: 1, sizePx: 4096 })).toThrow(RangeError);
    expect(() => generateTexture({ kind: "lava" as never, seed: 1 })).toThrow(RangeError);
  });
});

describe("suavizado (soften)", () => {
  const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
  const contrast = (d: Uint8ClampedArray, size: number) => {
    let s = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) s += Math.abs(lum(d, (y * size + x) * 4) - lum(d, (y * size + ((x + 1) % size)) * 4));
    return s / (size * size);
  };
  const base = { kind: "cracked-marble", seed: 5, sizePx: 128, cracks: "lines" } as const;

  it("soften 0 da los mismos bytes que sin la opción", () => {
    const a = generateTexture(base);
    const b = generateTexture({ ...base, soften: 0 });
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
  it("soften 3 baja el contraste local al menos un 30 %", () => {
    const a = generateTexture(base);
    const b = generateTexture({ ...base, soften: 3 });
    expect(contrast(b.data, 128)).toBeLessThanOrEqual(contrast(a.data, 128) * 0.7);
  });
  it("sigue empalmando: el salto entre la última columna y la primera no supera 1,5 veces el de columnas vecinas", () => {
    const { data } = generateTexture({ ...base, soften: 3 });
    const size = 128;
    const col = (x0: number, x1: number) => {
      let s = 0;
      for (let y = 0; y < size; y++) s += Math.abs(lum(data, (y * size + x0) * 4) - lum(data, (y * size + x1) * 4));
      return s / size;
    };
    let inner = 0;
    for (let x = 1; x < size - 2; x++) inner += col(x, x + 1);
    inner /= size - 3;
    expect(col(size - 1, 0)).toBeLessThanOrEqual(inner * 1.5);
  });
  it("con huecos no hay halo oscuro: ningún píxel con alfa > 0 baja de la luminancia mínima opaca menos 2", () => {
    const o = { kind: "cracked-marble", seed: 5, sizePx: 128, cracks: "holes" } as const;
    const raw = generateTexture(o).data;
    let min = 255;
    for (let i = 0; i < raw.length; i += 4) if (raw[i + 3] === 255) min = Math.min(min, lum(raw, i));
    const soft = generateTexture({ ...o, soften: 3 }).data;
    let seenPartial = false;
    for (let i = 0; i < soft.length; i += 4) {
      if (soft[i + 3]! > 0) {
        if (soft[i + 3]! < 255) seenPartial = true;
        expect(lum(soft, i)).toBeGreaterThanOrEqual(min - 2);
      }
    }
    expect(seenPartial).toBe(true);
  });
  it("misma semilla y opciones, mismos bytes", () => {
    const a = generateTexture({ ...base, soften: 2 });
    const b = generateTexture({ ...base, soften: 2 });
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
  it("TEXTURE_DEFAULTS está exportado", () => {
    expect(TEXTURE_DEFAULTS.stone).toEqual({ scale: 4, color: "#9a948a" });
  });
});
