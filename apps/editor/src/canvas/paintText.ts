import type { RenderItem } from "@free-book-cover/core";
import type { ImageSources } from "./scene";

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
// de exportación, por eso la forma, la curva y la textura coinciden.
export function paintTextItem(ctx: CanvasRenderingContext2D, item: TextItem, sources: ImageSources): void {
  const layout = item.layout;
  if (!layout) return;
  const ops: Op[] = layout.glyphs
    ? layout.glyphs.map((g) => ({ text: g.text, x: g.x, y: g.y, rotation: g.rotation, dx: -g.advance / 2, width: g.advance, style: g.style }))
    : layout.lines.flatMap((l) => l.pieces.map((p) => ({ text: p.text, x: p.x, y: l.baseline, rotation: 0, dx: 0, width: p.width, style: p.style })));
  if (ops.length === 0) return;

  const base = ctx.getTransform();
  const { shadow, outline } = item.effects;
  const tex = item.texture && sources.get(item.texture.assetId);
  const pattern = tex && item.texture ? makePattern(ctx, tex, item.texture) : null;

  const place = (op: Op, draw: () => void) => {
    ctx.save();
    ctx.translate(op.x, op.y);
    if (op.rotation) ctx.rotate(op.rotation);
    ctx.font = op.style.font;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    setSpacing(ctx, op.style.spacingPx);
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
          ctx.strokeText(op.text, op.dx, 0);
        } else {
          ctx.fillStyle = op.style.color;
          ctx.fillText(op.text, op.dx, 0);
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
        ctx.strokeText(op.text, op.dx, 0);
      });
    }
  }
  // 3) Relleno (color o textura) y subrayado.
  for (const op of ops) {
    place(op, () => {
      if (pattern) {
        // El patrón vive en el espacio de la caja aunque la letra esté girada.
        pattern.pattern.setTransform(ctx.getTransform().inverse().multiply(base).multiply(pattern.matrix));
        ctx.fillStyle = pattern.pattern;
      } else ctx.fillStyle = op.style.color;
      ctx.fillText(op.text, op.dx, 0);
      if (op.style.underline && op.width > 0) {
        const t = Math.max(1, op.style.fontPx / 20);
        ctx.fillRect(op.dx, op.style.fontPx * 0.12, op.width, t);
      }
    });
  }
  ctx.restore();
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

// Matriz que lleva la imagen (píxeles de la miniatura/origen decodificado) al encuadre "cubrir" de la caja.
function makePattern(ctx: CanvasRenderingContext2D, src: { image: CanvasImageSource; scale: number }, d: NonNullable<TextItem["texture"]>) {
  const pattern = ctx.createPattern(src.image, "no-repeat");
  if (!pattern) return null;
  const sx = d.dest.width / (d.src.width * src.scale);
  const sy = d.dest.height / (d.src.height * src.scale);
  const matrix = new DOMMatrix().translate(d.dest.x - d.src.x * src.scale * sx, d.dest.y - d.src.y * src.scale * sy).scale(sx, sy);
  return { pattern, matrix };
}
