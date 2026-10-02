import { Canvas, Ellipse, FabricImage, Rect as FRect, Textbox, type FabricObject } from "fabric";
import {
  BACKGROUND_FALLBACK, assetDims, drawCenter, panPosition, placeImage, rectCenter,
  type ImageDraw, type Point, type Project, type Rect, type RenderItem, type RenderedDocument,
} from "@free-book-cover/core";

// Imagen ya decodificada para la vista previa. scale = píxeles de la miniatura / píxeles del original.
export interface ImageSource {
  image: HTMLImageElement | ImageBitmap;
  scale: number;
}
export type ImageSources = Map<string, ImageSource>;

export interface SceneCallbacks {
  onSelect(id: string | null): void;
  // Caja resultante en px de la composición y giro en grados.
  onTransform(id: string, box: Rect, rotation: number): void;
  onBackgroundPan(pos: Point): void;
}

const ACCENT = "#a98a5f";
interface Tracked {
  id: string;
  box: Rect;
  center: Point;
  w: number;
  h: number;
}
interface BgContext {
  obj: FabricImage;
  src: ImageSource;
  region: Rect;
  box: Rect;
  fit: "cover" | "contain" | "fill";
  pos: Point;
}

// Aplica un encuadre (draw) a un objeto imagen de Fabric. Compartido por la composición y el arrastre del fondo.
function applyDraw(obj: FabricImage, draw: ImageDraw, k: number, center: Point, angle: number): void {
  const sw = Math.max(1, draw.src.width * k);
  const sh = Math.max(1, draw.src.height * k);
  obj.set({
    cropX: Math.max(0, draw.src.x * k), cropY: Math.max(0, draw.src.y * k), width: sw, height: sh,
    scaleX: draw.dest.width / sw, scaleY: draw.dest.height / sh,
    left: center.x, top: center.y, originX: "center", originY: "center", angle,
  });
  obj.setCoords();
}

// Vista Fabric del documento. Fabric es solo vista: nada de su estado se persiste (SDD D-03).
export class CoverScene {
  readonly canvas: Canvas;
  private tracked = new WeakMap<FabricObject, Tracked>();
  private rebuilding = false;
  private bg: BgContext | null = null;
  private pan: { x: number; y: number; start: Point; pos: Point } | null = null;
  private doc: Project | null = null;

  constructor(el: HTMLCanvasElement, private cb: SceneCallbacks) {
    this.canvas = new Canvas(el, { selection: false, preserveObjectStacking: true, renderOnAddRemove: false, uniformScaling: false });
    const c = this.canvas;
    const select = () => {
      if (this.rebuilding) return;
      const o = c.getActiveObject();
      this.cb.onSelect(o ? (this.tracked.get(o)?.id ?? null) : null);
    };
    c.on("selection:created", select);
    c.on("selection:updated", select);
    c.on("selection:cleared", select);
    c.on("object:modified", (e) => this.commit(e.target));
    c.on("mouse:down", (e) => {
      if (e.target || !this.bg) return;
      const ev = e.e as MouseEvent;
      this.pan = { x: ev.clientX, y: ev.clientY, start: this.bg.pos, pos: this.bg.pos };
      c.defaultCursor = "grabbing";
    });
    c.on("mouse:move", (e) => {
      if (!this.pan || !this.bg) return;
      const ev = e.e as MouseEvent;
      const b = this.bg;
      const pos = panPosition(b.region, b.box, b.fit, this.pan.start, ev.clientX - this.pan.x, ev.clientY - this.pan.y);
      this.pan.pos = pos;
      this.paintBackground(b, pos);
    });
    c.on("mouse:up", () => {
      const p = this.pan;
      this.pan = null;
      c.defaultCursor = this.bg ? "grab" : "default";
      if (p && this.bg && (p.pos.x !== p.start.x || p.pos.y !== p.start.y)) this.cb.onBackgroundPan(p.pos);
    });
  }

  dispose(): void {
    void this.canvas.dispose();
  }

  private paintBackground(b: BgContext, pos: Point): void {
    const placement = placeImage(b.region, b.box, b.fit, pos);
    applyDraw(b.obj, { ...placement, assetId: "", fit: b.fit, dpi: null, lowDpi: false }, b.src.scale, rectCenter(placement.dest), 0);
    this.canvas.requestRenderAll();
  }

  private commit(o: FabricObject | undefined): void {
    const t = o && this.tracked.get(o);
    if (!o || !t) return;
    const c = o.getCenterPoint();
    const w = o.getScaledWidth();
    const h = o.getScaledHeight();
    const nw = t.box.width * (w / t.w);
    const nh = t.box.height * (h / t.h);
    const cx = rectCenter(t.box).x + (c.x - t.center.x);
    const cy = rectCenter(t.box).y + (c.y - t.center.y);
    this.cb.onTransform(t.id, { x: cx - nw / 2, y: cy - nh / 2, width: nw, height: nh }, ((o.angle % 360) + 360) % 360);
  }

  private style(o: FabricObject): void {
    o.set({ transparentCorners: false, cornerColor: ACCENT, cornerStrokeColor: "#ffffff", borderColor: ACCENT, cornerStyle: "circle", cornerSize: 9, padding: 0 });
  }

  private track(o: FabricObject, id: string, box: Rect): void {
    this.tracked.set(o, { id, box, center: o.getCenterPoint(), w: o.getScaledWidth(), h: o.getScaledHeight() });
  }

  private makeImage(src: ImageSource, draw: ImageDraw, item: RenderItem | null): FabricImage {
    const obj = new FabricImage(src.image as HTMLImageElement);
    const rect = item ? drawCenter(item, draw.dest) : rectCenter(draw.dest);
    applyDraw(obj, draw, src.scale, rect, item?.rotation ?? 0);
    return obj;
  }

  // Reconstruye los objetos desde la composición. Barato para pocos elementos y evita estados divergentes.
  render(doc: Project, r: RenderedDocument, sources: ImageSources, selectedId: string | null, size: { width: number; height: number }): void {
    this.rebuilding = true;
    const c = this.canvas;
    this.doc = doc;
    c.discardActiveObject();
    c.remove(...c.getObjects());
    c.setDimensions({ width: size.width, height: size.height });
    this.bg = null;
    const bg = r.background;
    c.backgroundColor = bg.kind === "color" ? bg.color : bg.fallbackColor;
    if (bg.kind === "image" && bg.draw) {
      const src = sources.get(bg.draw.assetId);
      const dims = assetDims(doc.assets.find((a) => a.id === bg.draw!.assetId));
      if (src && dims) {
        const obj = this.makeImage(src, bg.draw, null);
        obj.set({ selectable: false, evented: false, hoverCursor: "grab" });
        c.add(obj);
        this.bg = {
          obj, src, fit: bg.draw.fit, pos: doc.canvas.backgroundPos ?? { x: 0.5, y: 0.5 },
          region: { x: 0, y: 0, width: dims.widthPx, height: dims.heightPx },
          box: { x: 0, y: 0, width: r.widthPx, height: r.heightPx },
        };
      }
    }
    c.defaultCursor = this.bg ? "grab" : "default";

    let active: FabricObject | null = null;
    for (const it of r.items) {
      const o = this.makeItem(it, sources);
      if (!o) continue;
      this.style(o);
      c.add(o);
      this.track(o, it.id, it.box);
      if (it.id === selectedId) active = o;
    }
    if (active) c.setActiveObject(active);
    this.rebuilding = false;
    c.requestRenderAll();
  }

  private makeItem(it: RenderItem, sources: ImageSources): FabricObject | null {
    const center = rectCenter(it.box);
    const common = { left: center.x, top: center.y, originX: "center", originY: "center", angle: it.rotation } as const;
    if (it.kind === "image") {
      const src = it.draw && sources.get(it.draw.assetId);
      if (it.draw && src) return this.makeImage(src, it.draw, it);
      // Sin dimensiones o aún sin decodificar: marcador de posición.
      return new FRect({ ...common, width: it.box.width, height: it.box.height, fill: "rgba(255,255,255,.08)", stroke: "rgba(255,255,255,.4)", strokeDashArray: [6, 4] });
    }
    if (it.kind === "shape") {
      const e = it.element;
      const stroke = e.stroke ? { stroke: e.stroke.color, strokeWidth: e.stroke.width * (it.box.width / Math.max(e.width, 1e-9)) } : {};
      return e.shape === "ellipse"
        ? new Ellipse({ ...common, rx: it.box.width / 2, ry: it.box.height / 2, fill: e.fill, ...stroke })
        : new FRect({ ...common, width: it.box.width, height: it.box.height, fill: e.fill, ...stroke });
    }
    // Texto: representación básica; el motor tipográfico completo llega en el paso de texto.
    const e = it.element;
    const run = e.runs[0];
    const ppi = it.box.width / Math.max(e.width, 1e-9);
    return new Textbox(e.runs.map((x) => (x.uppercase ? x.text.toUpperCase() : x.text)).join(""), {
      ...common, width: it.box.width, editable: false,
      fontFamily: run?.fontFamily ?? "serif", fontSize: ((run?.fontSizePt ?? 24) / 72) * ppi, fontWeight: run?.weight ?? 400,
      fontStyle: run?.italic ? "italic" : "normal", fill: run?.color ?? "#ffffff", textAlign: e.align === "justify" ? "justify" : e.align,
      lineHeight: e.lineHeight,
    });
  }

  // Solo para pruebas e2e: píxeles del lienzo Fabric.
  toDataURL(): string {
    return this.canvas.toDataURL({ format: "png", multiplier: 1 });
  }
}

export { BACKGROUND_FALLBACK };
