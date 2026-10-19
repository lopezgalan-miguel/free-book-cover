import type { RenderItem } from "@free-book-cover/core";
import { compositeLayer, layerSupported, openLayer } from "./layer";

export type ShapeItem = Extract<RenderItem, { kind: "shape" }>;

// Grosor del borde en px de la composición: el documento lo guarda en pulgadas y la caja ya está escalada.
export function shapeStrokePx(item: ShapeItem): number {
  const s = item.element.stroke;
  return s ? s.width * (item.box.width / Math.max(item.element.width, 1e-9)) : 0;
}

// Pinta una forma con el origen del contexto en la esquina superior izquierda de la caja y sin girar.
// Es el ÚNICO camino de dibujo de formas: lo usan la vista previa (Fabric) y el pintor de exportación.
// Con opacidad, relleno y borde se componen en una capa para que el borde no deje ver el relleno.
export function paintShapeItem(ctx: CanvasRenderingContext2D, item: ShapeItem): void {
  if (item.opacity < 1) {
    if (layerSupported(ctx)) {
      const layer = openLayer(ctx, { x: 0, y: 0, width: item.box.width, height: item.box.height }, shapeStrokePx(item));
      if (!layer) return;
      drawShape(layer.ctx, item);
      compositeLayer(ctx, layer, { opacity: item.opacity });
      return;
    }
    ctx.save();
    ctx.globalAlpha *= item.opacity;
    drawShape(ctx, item);
    ctx.restore();
    return;
  }
  drawShape(ctx, item);
}

function drawShape(ctx: CanvasRenderingContext2D, item: ShapeItem): void {
  const { width: w, height: h } = item.box;
  const e = item.element;
  ctx.beginPath();
  if (e.shape === "ellipse") ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(0, 0, w, h);
  ctx.fillStyle = e.fill;
  ctx.fill();
  const lw = shapeStrokePx(item);
  if (e.stroke && lw > 0) {
    ctx.strokeStyle = e.stroke.color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
