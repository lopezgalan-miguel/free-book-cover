import { TEXTURE_KINDS, generateTexture, type Asset, type GeneratedTexture, type TextureOptions } from "@free-book-cover/core";
import type { ImagePort } from "../store/ports";
import { context2d, makeCanvas } from "../canvas/layer";
import { browserThumbnail, importImage, type ImportResult, type ThumbnailMaker } from "./importImage";

export type PngEncoder = (t: GeneratedTexture) => Promise<Blob>;

// PNG con el navegador (conserva la transparencia de las grietas).
export const browserEncodePng: PngEncoder = async (t) => {
  const canvas = makeCanvas(t.widthPx, t.heightPx);
  context2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(t.data), t.widthPx, t.heightPx), 0, 0);
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/png" });
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("encode_failed");
  return blob;
};

// Genera una textura incluida y la guarda como recurso del proyecto, igual que una imagen subida.
export async function generateTextureAsset(
  store: ImagePort,
  opts: TextureOptions,
  deps: { encode?: PngEncoder; makeThumbnail?: ThumbnailMaker } = {},
  expectedRevision?: number,
): Promise<ImportResult> {
  const blob = await (deps.encode ?? browserEncodePng)(generateTexture(opts));
  const file = new File([blob], `textura-${opts.kind}-${opts.seed}.png`, { type: "image/png" });
  return importImage(store, file, "asset", deps.makeThumbnail ?? browserThumbnail, expectedRevision, { generator: opts });
}

const HEX = /^#[0-9a-f]{6}$/i;

// Ajustes con los que se generó la textura de un recurso (metadata.generator); null si no los hay o no valen.
export function generatorOptionsOf(asset: Asset | undefined): TextureOptions | null {
  const g = asset?.metadata.generator;
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  const kind = (TEXTURE_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as TextureOptions["kind"]) : null;
  if (!kind || typeof o.seed !== "number" || !Number.isFinite(o.seed)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const hex = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v : undefined);
  const scale = num(o.scale);
  const soften = num(o.soften);
  const color = hex(o.color);
  const crackColor = hex(o.crackColor);
  const cracks = o.cracks === "holes" || o.cracks === "lines" ? o.cracks : undefined;
  return {
    kind, seed: o.seed,
    ...(scale !== undefined ? { scale } : {}),
    ...(color ? { color } : {}),
    ...(soften !== undefined ? { soften } : {}),
    ...(cracks ? { cracks } : {}),
    ...(crackColor ? { crackColor } : {}),
  };
}
