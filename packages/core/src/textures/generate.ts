// Texturas procedurales para rellenar letras (fase 2, punto 8). Puras, deterministas por semilla y sin
// costuras: todo el ruido es periódico sobre la imagen (rejilla que envuelve) y las celdas de Voronoi se
// buscan en el toro, así una tesela empalma consigo misma en mosaico.

export const TEXTURE_KINDS = ["cracked-marble", "stone", "paper"] as const;
export type TextureKind = (typeof TEXTURE_KINDS)[number];

export interface TextureOptions {
  kind: TextureKind;
  seed: number;
  // Lado en px (cuadrada), 64..2048. Por defecto 1024.
  sizePx?: number;
  // Celdas (placas, granos) a lo ancho, 1..32. Por defecto según el tipo.
  scale?: number;
  // Color base #rrggbb. Por defecto según el tipo.
  color?: string;
  // Solo mármol: grietas transparentes (se ve lo que hay detrás) o líneas opacas del color crackColor.
  cracks?: "holes" | "lines";
  // Solo mármol con líneas: color de las grietas. Por defecto rojo muy oscuro.
  crackColor?: string;
}

export interface GeneratedTexture {
  widthPx: number;
  heightPx: number;
  data: Uint8ClampedArray; // RGBA
}

const DEFAULTS: Record<TextureKind, { scale: number; color: string }> = {
  "cracked-marble": { scale: 10, color: "#f4cfb3" },
  stone: { scale: 4, color: "#9a948a" },
  paper: { scale: 8, color: "#efe6d2" },
};

// Generador pseudoaleatorio pequeño y reproducible (mulberry32).
function rng(seed: number): () => number {
  let a = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mod = (a: number, n: number) => ((a % n) + n) % n;

// Ruido de valor periódico: una rejilla de px × py valores aleatorios que envuelve en los dos ejes.
class PeriodicNoise {
  private readonly v: Float32Array;
  constructor(readonly px: number, readonly py: number, rand: () => number) {
    this.v = new Float32Array(px * py);
    for (let i = 0; i < this.v.length; i++) this.v[i] = rand();
  }
  // u, v en [0, 1): coordenadas de la imagen.
  at(u: number, w: number): number {
    const x = u * this.px;
    const y = w * this.py;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const g = (i: number, j: number) => this.v[mod(j, this.py) * this.px + mod(i, this.px)]!;
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  }
}

// Suma de octavas (fbm) periódica: cada octava dobla el periodo, que sigue siendo entero.
function fbm(rand: () => number, base: number, octaves: number, stretchX = 1, stretchY = 1) {
  const layers = Array.from({ length: octaves }, (_, o) => new PeriodicNoise(base * stretchX * 2 ** o, base * stretchY * 2 ** o, rand));
  return {
    at(u: number, v: number): number {
      let s = 0;
      let amp = 0.5;
      let norm = 0;
      for (const l of layers) {
        s += l.at(u, v) * amp;
        norm += amp;
        amp /= 2;
      }
      return s / norm;
    },
  };
}

// Voronoi en el toro: g × g celdas con un punto cada una. Devuelve F1, F2, F3 (en celdas) y el índice de la más próxima.
function voronoi(g: number, rand: () => number) {
  const pts = new Float32Array(g * g * 2);
  for (let i = 0; i < g * g; i++) {
    pts[i * 2] = 0.1 + 0.8 * rand();
    pts[i * 2 + 1] = 0.1 + 0.8 * rand();
  }
  return (u: number, v: number) => {
    const x = u * g;
    const y = v * g;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    let f3 = Infinity;
    let id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const ix = cx + i;
        const iy = cy + j;
        const k = mod(iy, g) * g + mod(ix, g);
        const dx = ix + pts[k * 2]! - x;
        const dy = iy + pts[k * 2 + 1]! - y;
        const d = Math.hypot(dx, dy);
        if (d < f1) {
          f3 = f2;
          f2 = f1;
          f1 = d;
          id = k;
        } else if (d < f2) {
          f3 = f2;
          f2 = d;
        } else if (d < f3) f3 = d;
      }
    }
    return { f1, f2, f3, id };
  };
}

function parseColor(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new RangeError(`color #rrggbb: ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Muestreador de la textura en coordenadas de píxel (admite coordenadas fuera de 0..size-1: la textura es
// periódica, así que (x + size, y) da el mismo color que (x, y)). Escribe RGBA en data[i..i+3].
export type TextureSampler = (x: number, y: number, data: Uint8ClampedArray | number[], i: number) => void;

export function textureSampler(o: TextureOptions): { size: number; sample: TextureSampler } {
  if (!TEXTURE_KINDS.includes(o.kind)) throw new RangeError(`tipo de textura desconocido: ${String(o.kind)}`);
  const size = o.sizePx ?? 1024;
  if (!Number.isInteger(size) || size < 64 || size > 2048) throw new RangeError("sizePx debe ser un entero entre 64 y 2048");
  const scale = Math.round(o.scale ?? DEFAULTS[o.kind].scale);
  if (!(scale >= 1 && scale <= 32)) throw new RangeError("scale debe estar entre 1 y 32");
  const [br, bg, bb] = parseColor(o.color ?? DEFAULTS[o.kind].color);
  const rand = rng(o.seed);
  const tone = (data: Uint8ClampedArray | number[], i: number, k: number, a = 255) => {
    data[i] = Math.min(255, Math.max(0, br * k));
    data[i + 1] = Math.min(255, Math.max(0, bg * k));
    data[i + 2] = Math.min(255, Math.max(0, bb * k));
    data[i + 3] = a;
  };

  if (o.kind === "cracked-marble") {
    const plates = voronoi(scale, rand);
    const fine = voronoi(scale * 2, rand);
    // Deformación del dominio a dos escalas: grietas quebradas y cantos dentados, no polígonos rectos.
    const warpA = fbm(rand, 6, 3);
    const warpB = fbm(rand, 6, 3);
    const jag = fbm(rand, 48, 2);
    const width = fbm(rand, 10, 2);
    // Grietas discontinuas (tramos y cuentas), manchas de la piedra, grano y motas claras.
    const beads = fbm(rand, scale * 6, 2);
    const hairArea = fbm(rand, 3, 3);
    const blotch = fbm(rand, scale * 3, 4);
    const pits = new PeriodicNoise(Math.round(size / 6), Math.round(size / 6), rand);
    const grain = new PeriodicNoise(Math.round(size / 2), Math.round(size / 2), rand);
    const speck = new PeriodicNoise(Math.round(size / 3), Math.round(size / 3), rand);
    const tint = Float32Array.from({ length: scale * scale }, () => 0.96 + 0.06 * rand());
    const holes = (o.cracks ?? "holes") === "holes";
    const [cr, cg, cb] = parseColor(o.crackColor ?? "#460808");
    const crack = (data: Uint8ClampedArray | number[], i: number) => {
      if (holes) return tone(data, i, 0, 0);
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
    };
    const warp = (0.06 * 6) / scale;
    return {
      size,
      sample(x, y, data, i) {
        const u = x / size;
        const v = y / size;
        const j = (jag.at(u, v) - 0.5) * 0.01;
        const wu = u + (warpA.at(u, v) - 0.5) * warp + j;
        const wv = v + (warpB.at(u, v) - 0.5) * warp + j;
        const p = plates(wu, wv);
        const edge = p.f2 - p.f1;
        const w = 0.02 + 0.035 * width.at(u, v) ** 2;
        // Nudo en los cruces (tres celdas casi a la misma distancia), más ancho que la grieta.
        const node = p.f3 - p.f1 < w * 2.2;
        const f = fine(wu, wv);
        const hair = f.f2 - f.f1 < 0.025 && hairArea.at(v, u) > 0.62;
        const broken = beads.at(u, v) < 0.3;
        if (node || (edge < w && !broken) || (hair && !broken)) {
          // Motas blancas en algunos nudos: canto astillado que brilla.
          if (node && speck.at(u, v) > 0.75) return tone(data, i, 1.25);
          return crack(data, i);
        }
        // Poros sueltos en la placa (cuentas de la misma grieta).
        if (pits.at(u, v) > 0.95) return crack(data, i);
        // Placa: manchas contrastadas, grano, tono por placa y motas claras junto a la grieta.
        const b = blotch.at(u, v);
        let k = (0.88 + 0.16 * smooth(Math.min(1, Math.max(0, (b - 0.25) * 2)))) * tint[p.id]! * (0.97 + 0.06 * grain.at(u, v));
        if (edge < w * 2.2 && speck.at(u, v) > 0.8) k = Math.min(1.3, k + 0.2);
        tone(data, i, Math.min(1.3, k));
      },
    };
  }
  if (o.kind === "stone") {
    const body = fbm(rand, scale, 5);
    const pores = new PeriodicNoise(scale * 24, scale * 24, rand);
    return {
      size,
      sample(x, y, data, i) {
        const u = x / size;
        const v = y / size;
        tone(data, i, (0.7 + 0.55 * body.at(u, v)) * (pores.at(u, v) > 0.8 ? 0.65 : 1));
      },
    };
  }
  // Papel: fibras (ruido muy estirado en horizontal) sobre un tono claro con nubes suaves.
  const fibers = fbm(rand, scale, 3, 1, 12);
  const clouds = fbm(rand, 2, 4);
  return {
    size,
    sample(x, y, data, i) {
      const u = x / size;
      const v = y / size;
      tone(data, i, 0.9 + 0.08 * clouds.at(u, v) + 0.06 * (fibers.at(u, v) - 0.5));
    },
  };
}

export function generateTexture(o: TextureOptions): GeneratedTexture {
  const { size, sample } = textureSampler(o);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) sample(x, y, data, (y * size + x) * 4);
  return { widthPx: size, heightPx: size, data };
}
