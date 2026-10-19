import { generateTexture, type GeneratedTexture, type TextureOptions } from "@free-book-cover/core";
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
  return importImage(store, file, "asset", deps.makeThumbnail ?? browserThumbnail, expectedRevision);
}
