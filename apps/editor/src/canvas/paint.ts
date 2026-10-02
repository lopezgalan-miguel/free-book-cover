import { drawCenter, rectCenter, type ImageDraw, type RenderedDocument } from "@free-book-cover/core";
import type { ImageSources } from "./scene";

// Pintor 2D de una composición: el camino de la futura exportación. Usa exactamente
// los mismos encuadres (src/dest) que la vista previa de Fabric.
export function paintDocument(ctx: CanvasRenderingContext2D, r: RenderedDocument, sources: ImageSources): void {
  const drawImage = (d: ImageDraw, center: { x: number; y: number }, angle: number) => {
    const s = sources.get(d.assetId);
    if (!s) return;
    const k = s.scale;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(s.image, d.src.x * k, d.src.y * k, d.src.width * k, d.src.height * k, -d.dest.width / 2, -d.dest.height / 2, d.dest.width, d.dest.height);
    ctx.restore();
  };
  ctx.fillStyle = r.background.kind === "color" ? r.background.color : r.background.fallbackColor;
  ctx.fillRect(0, 0, r.widthPx, r.heightPx);
  if (r.background.kind === "image" && r.background.draw) drawImage(r.background.draw, rectCenter(r.background.draw.dest), 0);
  for (const it of r.items) {
    if (it.kind === "image" && it.draw) drawImage(it.draw, drawCenter(it, it.draw.dest), it.rotation);
    else if (it.kind === "shape") {
      const c = rectCenter(it.box);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((it.rotation * Math.PI) / 180);
      ctx.fillStyle = it.element.fill;
      if (it.element.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(0, 0, it.box.width / 2, it.box.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-it.box.width / 2, -it.box.height / 2, it.box.width, it.box.height);
      ctx.restore();
    }
  }
}
