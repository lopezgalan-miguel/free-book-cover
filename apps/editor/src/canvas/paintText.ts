import type { RenderItem, ShadowPx } from "@free-book-cover/core";
import type { ImageSources } from "./scene";
import { compositeLayer, context2d, deviceScale, layerSupported, makeCanvas, openLayer, scaleShadow, type Ctx2D, type Layer } from "./layer";
import { maskImage } from "./mask";

export type TextItem = Extract<RenderItem, { kind: "text" }>;
interface Op {
  text: string;
  x: number;
  y: number;
  rotation: number;
  // Desplazamiento horizontal del texto respecto a x (letras sobre arco: centradas).
  dx: number;
  width: number;
  style: { font: string; fontPx: number; color: string; underline: boolean; spacingPx: number };
}

// Pinta un bloque de texto con el origen del contexto en la esquina superior izquierda de la caja
// y sin girar. Es el ÚNICO camino de dibujo de texto: lo usan la vista previa (Fabric) y el pintor
// de exportación, por eso la forma, la curva, la textura y los efectos coinciden.
//
// Con máscara, sombra interior u opacidad, las letras se componen primero en una capa (relleno,
// sombra interior y recorte) y la capa se vuelca con la sombra exterior: así la sombra es la de la
// letra ya recortada y la opacidad no deja ver la sombra a través del relleno.
export function paintTextItem(ctx: CanvasRenderingContext2D, item: TextItem, sources: ImageSources): void {
  const layout = item.layout;
  if (!layout) return;
  const ops: Op[] = layout.glyphs
    ? layout.glyphs.map((g) => ({ text: g.text, x: g.x, y: g.y, rotation: g.rotation, dx: -g.advance / 2, width: g.advance, style: g.style }))
    : layout.lines.flatMap((l) => l.pieces.map((p) => ({ text: p.text, x: p.x, y: l.baseline, rotation: 0, dx: 0, width: p.width, style: p.style })));
  if (ops.length === 0) return;

  const layered = (item.mask !== null || item.effects.innerShadow !== null || item.opacity < 1) && layerSupported(ctx);
  if (layered) {
    // Margen de un cuerpo (más el contorno) alrededor de la caja: rasgos y letras sobre arco que sobresalen.
    const margin = Math.max(...ops.map((o) => o.style.fontPx)) + (item.effects.outline?.width ?? 0);
    const layer = openLayer(ctx, { x: 0, y: 0, width: item.box.width, height: item.box.height }, margin);
    if (!layer) return;
    paintGlyphs(layer.ctx, item, ops, sources, null);
    // La sombra interior va antes que la máscara: sigue el contorno de la letra y no marca como líneas
    // oscuras los bordes que la máscara abre (p. ej. las grietas de un mármol).
    if (item.effects.innerShadow) applyInnerShadow(layer, scaleShadow(item.effects.innerShadow, layer.k));
    if (item.mask) applyMask(layer.ctx, item, sources);
    const shadow = item.effects.shadow && scaleShadow(item.effects.shadow, layer.k);
    compositeLayer(ctx, layer, { opacity: item.opacity, shadow });
    return;
  }
  const k = deviceScale(ctx);
  ctx.save();
  // Sin capa (p. ej. un contexto sin transformación legible), la opacidad se aplica a cada pasada.
  if (item.opacity < 1) ctx.globalAlpha *= item.opacity;
  paintGlyphs(ctx, item, ops, sources, item.effects.shadow && scaleShadow(item.effects.shadow, k));
  ctx.restore();
}

// Sombra (si se pide), contorno y relleno con subrayado, en este orden, sobre `ctx`.
function paintGlyphs(ctx: Ctx2D, item: TextItem, ops: Op[], sources: ImageSources, shadow: ShadowPx | null): void {
  const base = ctx.getTransform?.();
  const { outline } = item.effects;
  const tex = item.texture && sources.get(item.texture.assetId);
  const pattern = tex && item.texture ? makePattern(ctx, tex.image, tex.scale, item.texture) : null;
  // Anchura de las letras: la maquetación ya viene estrechada; aquí se estrecha el dibujo. Dentro del
  // espacio escalado, desplazamientos, espaciado y subrayado se dividen por la escala.
  const sx = item.element.scaleX ?? 1;

  const place = (op: Op, draw: () => void) => {
    ctx.save();
    ctx.translate(op.x, op.y);
    if (op.rotation) ctx.rotate(op.rotation);
    if (sx !== 1) ctx.scale(sx, 1);
    ctx.font = op.style.font;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    setSpacing(ctx, op.style.spacingPx / sx);
    draw();
    ctx.restore();
  };
  const noShadow = () => {
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  ctx.save();
  // 1) Sombra de la silueta completa (contorno incluido), bajo todo lo demás.
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.dx;
    ctx.shadowOffsetY = shadow.dy;
    for (const op of ops) {
      place(op, () => {
        if (outline) {
          ctx.lineJoin = "round";
          ctx.lineWidth = outline.width;
          ctx.strokeStyle = outline.color;
          ctx.strokeText(op.text, op.dx / sx, 0);
        } else {
          ctx.fillStyle = op.style.color;
          ctx.fillText(op.text, op.dx / sx, 0);
        }
      });
    }
    noShadow();
  }
  // 2) Contorno por debajo del relleno.
  if (outline) {
    for (const op of ops) {
      place(op, () => {
        ctx.lineJoin = "round";
        ctx.lineWidth = outline.width;
        ctx.strokeStyle = outline.color;
        ctx.strokeText(op.text, op.dx / sx, 0);
      });
    }
  }
  // 3) Relleno (color o textura) y subrayado.
  for (const op of ops) {
    place(op, () => {
      if (pattern && base) {
        // El patrón vive en el espacio de la caja aunque la letra esté girada.
        pattern.pattern.setTransform(ctx.getTransform().inverse().multiply(base).multiply(pattern.matrix));
        ctx.fillStyle = pattern.pattern;
      } else ctx.fillStyle = op.style.color;
      ctx.fillText(op.text, op.dx / sx, 0);
      if (op.style.underline && op.width > 0) {
        const t = Math.max(1, op.style.fontPx / 20);
        ctx.fillRect(op.dx / sx, op.style.fontPx * 0.12, op.width / sx, t);
      }
    });
  }
  ctx.restore();
}

// Recorte con la máscara: dentro de la caja solo queda la letra donde la máscara es opaca. Fuera de la
// caja (letras sobre arco, rasgos que sobresalen) no se toca nada.
function applyMask(ctx: Ctx2D, item: TextItem, sources: ImageSources): void {
  const m = item.mask!;
  const src = sources.get(m.assetId);
  if (!src) return;
  const p = makePattern(ctx, maskImage(src.image, m.mode, m.threshold, m.softness), src.scale, m);
  if (!p) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, item.box.width, item.box.height);
  ctx.clip();
  ctx.globalCompositeOperation = "destination-in";
  p.pattern.setTransform(p.matrix);
  ctx.fillStyle = p.pattern;
  ctx.fillRect(0, 0, item.box.width, item.box.height);
  ctx.restore();
}

// Sombra interior: se proyecta la sombra del negativo de la letra (todo menos la letra) y solo se
// conserva sobre la letra (source-atop). El negativo se dibuja muy desplazado, fuera de la capa, y la
// sombra compensa ese desplazamiento: solo cae la sombra.
const FAR = 100_000;
function applyInnerShadow(layer: Layer, s: ShadowPx): void {
  const { width: w, height: h } = layer.canvas;
  const neg = makeCanvas(w, h);
  const nc = context2d(neg);
  nc.fillStyle = "#000";
  nc.fillRect(0, 0, w, h);
  nc.globalCompositeOperation = "destination-out";
  nc.drawImage(layer.canvas as CanvasImageSource, 0, 0);
  const c = layer.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-atop";
  c.shadowColor = s.color;
  c.shadowBlur = s.blur;
  c.shadowOffsetX = s.dx + FAR;
  c.shadowOffsetY = s.dy;
  c.drawImage(neg as CanvasImageSource, -FAR, 0);
  c.restore();
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

// Matriz que lleva la imagen (píxeles de la miniatura/origen decodificado) a su encuadre en la caja:
// "cubrir" la caja o, en mosaico, una tesela que el patrón repite.
function makePattern(ctx: CanvasRenderingContext2D, image: CanvasImageSource, scale: number, d: NonNullable<TextItem["texture"]>) {
  const pattern = ctx.createPattern(image, d.repeat ? "repeat" : "no-repeat");
  if (!pattern) return null;
  const sx = d.dest.width / (d.src.width * scale);
  const sy = d.dest.height / (d.src.height * scale);
  const matrix = new DOMMatrix().translate(d.dest.x - d.src.x * scale * sx, d.dest.y - d.src.y * scale * sy).scale(sx, sy);
  return { pattern, matrix };
}
