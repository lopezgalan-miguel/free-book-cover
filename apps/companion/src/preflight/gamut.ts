import sharp from "sharp";

/** Diferencia de color (ΔE76) a partir de la cual un píxel «cambia de forma visible» al imprimir. */
export const GAMUT_DELTA_E = 10;
/** Porcentaje de píxeles marcados a partir del cual se avisa. */
export const GAMUT_WARN_PERCENT = 1;

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB (0..255) a CIE Lab con blanco D65. */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export interface GamutResult {
  /** Porcentaje de píxeles con ΔE > GAMUT_DELTA_E (una décima). */
  percent: number;
  maxDeltaE: number;
  /** Mapa PNG del tamaño de la prueba: los píxeles que cambian en magenta sobre la prueba aclarada. */
  png: Buffer;
}

/**
 * Compara la imagen RGB enviada con la prueba visual del PDF CMYK (devuelta a sRGB por Ghostscript) para
 * señalar los colores que se pierden al imprimir (p. ej. rojos y azules muy saturados). Es una ayuda: la
 * imprenta de KDP usa su propio perfil y el resultado real puede variar.
 */
export async function gamutMap(rgb: Buffer, proof: Buffer): Promise<GamutResult> {
  const p = await sharp(proof).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const { width, height } = p.info;
  const src = await sharp(rgb).removeAlpha().toColourspace("srgb").resize(width, height, { fit: "fill" }).raw().toBuffer();
  const n = width * height;
  const out = Buffer.alloc(n * 3);
  let marked = 0;
  let maxDeltaE = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const a = srgbToLab(src[k]!, src[k + 1]!, src[k + 2]!);
    const b = srgbToLab(p.data[k]!, p.data[k + 1]!, p.data[k + 2]!);
    const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (dE > maxDeltaE) maxDeltaE = dE;
    if (dE > GAMUT_DELTA_E) {
      marked++;
      out[k] = 255; out[k + 1] = 0; out[k + 2] = 255;
    } else {
      // Prueba aclarada (35 % de su color sobre blanco) para que resalte lo marcado.
      for (let c = 0; c < 3; c++) out[k + c] = Math.round(255 - (255 - p.data[k + c]!) * 0.35);
    }
  }
  const png = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { percent: Math.round((marked / n) * 1000) / 10, maxDeltaE, png };
}
