import { drawCenter, rectCenter, type ImageDraw, type ImageFilters, type RenderedDocument } from "@free-book-cover/core";
import { drawFilteredImage } from "./imageFilters";
import { paintTextItem } from "./paintText";
import { paintShapeItem } from "./paintShape";
import type { ImageSources } from "./scene";

// Pintor 2D de una composición: el camino de la futura exportación. Usa exactamente
// los mismos encuadres (src/dest) que la vista previa de Fabric.
export function paintDocument(ctx: CanvasRenderingContext2D, r: RenderedDocument, sources: ImageSources): void {
  const drawImage = (d: ImageDraw, center: { x: number; y: number }, angle: number, filters: ImageFilters | null = null, opacity = 1) => {
    const s = sources.get(d.assetId);
    if (!s) return;
    const k = s.scale;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((angle * Math.PI) / 180);
    if (opacity < 1) ctx.globalAlpha *= opacity;
    const args = [d.src.x * k, d.src.y * k, d.src.width * k, d.src.height * k, -d.dest.width / 2, -d.dest.height / 2, d.dest.width, d.dest.height] as const;
    if (filters) drawFilteredImage(ctx, s.image, ...args, filters);
    else ctx.drawImage(s.image, ...args);
    ctx.restore();
  };
  ctx.fillStyle = r.background.kind === "color" ? r.background.color : r.background.fallbackColor;
  ctx.fillRect(0, 0, r.widthPx, r.heightPx);
  if (r.background.kind === "image" && r.background.draw) drawImage(r.background.draw, rectCenter(r.background.draw.dest), 0, r.background.filters);
  for (const it of r.items) {
    if (it.kind === "image") {
      if (it.draw) drawImage(it.draw, drawCenter(it, it.draw.dest), it.rotation, it.filters, it.opacity);
      continue;
    }
    // Texto y formas: origen en la esquina de la caja, girada alrededor de su centro (igual que en Fabric).
    const c = rectCenter(it.box);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((it.rotation * Math.PI) / 180);
    ctx.translate(-it.box.width / 2, -it.box.height / 2);
    if (it.kind === "text") paintTextItem(ctx, it, sources);
    else paintShapeItem(ctx, it);
    ctx.restore();
  }
}
