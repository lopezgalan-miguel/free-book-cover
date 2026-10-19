import { describe, expect, it } from "vitest";
import { TEXTURE_KINDS, generateTexture, textureSampler } from "../src/index.js";

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
  it("rechaza tamaños fuera de 64..2048 y tipos desconocidos", () => {
    expect(() => generateTexture({ kind: "stone", seed: 1, sizePx: 32 })).toThrow(RangeError);
    expect(() => generateTexture({ kind: "stone", seed: 1, sizePx: 4096 })).toThrow(RangeError);
    expect(() => generateTexture({ kind: "lava" as never, seed: 1 })).toThrow(RangeError);
  });
});
