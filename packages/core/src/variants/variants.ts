import { CUSTOM_PRESET_ID, CUSTOM_PRESET_VERSION, type DigitalPreset } from "../presets/digital.js";
import { DEFAULT_PX_PER_IN } from "../canvas/presets.js";
import { rotatePoint, type Rect } from "../geometry/fit.js";
import {
  MAX_TARGET_PX, layoutOverridesSchema,
  type DigitalTarget, type Element, type ElementOverride, type LayoutOverrides, type Project,
} from "../schema/project.js";

// Las variantes se definen en píxeles; el documento derivado usa pulgadas a 300 ppp (D-04),
// de modo que exportar a 300 ppp da exactamente los píxeles del destino.
export const VARIANT_PX_PER_IN = DEFAULT_PX_PER_IN;

export interface ResolvedTarget extends DigitalTarget {
  id: string;
  widthPx: number;
  heightPx: number;
}

// Una variante guardada es utilizable si trae identidad y dimensiones resueltas.
export function isResolvedTarget(t: DigitalTarget): t is ResolvedTarget {
  return t.id !== undefined && t.widthPx !== undefined && t.heightPx !== undefined;
}

export function targetFromPreset(preset: DigitalPreset, id: string): ResolvedTarget {
  return {
    id, name: `${preset.platform} · ${preset.label}`, presetId: preset.id, presetVersion: preset.version,
    widthPx: preset.widthPx, heightPx: preset.heightPx, formats: [...preset.formats], layoutOverrides: {},
  };
}

export type CustomTargetResult = { ok: true; target: ResolvedTarget } | { ok: false; reason: "invalid_size" };

export function customTarget(id: string, widthPx: number, heightPx: number, name?: string): CustomTargetResult {
  const ok = [widthPx, heightPx].every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_TARGET_PX);
  if (!ok) return { ok: false, reason: "invalid_size" };
  return {
    ok: true,
    target: {
      id, name: name ?? `custom · ${widthPx}×${heightPx}`, presetId: CUSTOM_PRESET_ID, presetVersion: CUSTOM_PRESET_VERSION,
      widthPx, heightPx, formats: ["png", "jpeg", "webp"], layoutOverrides: {},
    },
  };
}

export function overridesOf(target: DigitalTarget): LayoutOverrides {
  const r = layoutOverridesSchema.safeParse(target.layoutOverrides);
  return r.success ? r.data : {};
}

interface CoverMap {
  scale: number;
  // Rectángulo del lienzo base que queda visible en la variante (pulgadas del base).
  visible: Rect;
}

// Derivación por defecto: el diseño base se escala de forma uniforme hasta cubrir la variante y se
// centra. Se pierde lo que queda fuera (el usuario lo ve como área visible y puede reajustarlo).
function coverMap(base: Project, vw: number, vh: number): CoverMap {
  const bw = base.canvas.widthIn;
  const bh = base.canvas.heightIn;
  const scale = Math.max(vw / bw, vh / bh);
  const width = vw / scale;
  const height = vh / scale;
  return { scale, visible: { x: (bw - width) / 2, y: (bh - height) / 2, width, height } };
}

// Área del diseño base que muestra la variante por defecto y su proporción del lienzo base.
export function visibleArea(base: Project, target: ResolvedTarget): { rect: Rect; coverage: number } {
  const m = coverMap(base, target.widthPx / VARIANT_PX_PER_IN, target.heightPx / VARIANT_PX_PER_IN);
  return { rect: m.visible, coverage: (m.visible.width * m.visible.height) / (base.canvas.widthIn * base.canvas.heightIn) };
}

function deriveElement(e: Element, m: CoverMap, base: Project, vw: number, vh: number, ov: ElementOverride | undefined): Element {
  const s = m.scale;
  const bw = base.canvas.widthIn;
  const bh = base.canvas.heightIn;
  const derived = {
    x: (e.x - bw / 2) * s + vw / 2,
    y: (e.y - bh / 2) * s + vh / 2,
    width: e.width * s,
    height: e.height * s,
  };
  const geo = {
    x: ov?.x ?? derived.x,
    y: ov?.y ?? derived.y,
    width: ov?.width ?? derived.width,
    height: ov?.height ?? derived.height,
    rotation: ov?.rotation ?? e.rotation,
    visible: ov?.visible ?? e.visible,
  };
  if (e.type === "text") {
    const k = s * (ov?.fontScale ?? 1);
    return { ...e, ...geo, runs: e.runs.map((r) => ({ ...r, fontSizePt: r.fontSizePt * k })) };
  }
  if (e.type === "image") {
    return { ...e, ...geo, ...(ov?.fit ? { fit: ov.fit } : {}), ...(ov?.crop ? { crop: ov.crop } : {}) };
  }
  return { ...e, ...geo, ...(e.stroke ? { stroke: { ...e.stroke, width: e.stroke.width * s } } : {}) };
}

// Documento de la variante: mismos recursos y textos del base, con geometría propia. Pura y derivada
// del base + sus ajustes; no modifica ninguno de los dos.
export function variantDocument(base: Project, target: ResolvedTarget): Project {
  const vw = target.widthPx / VARIANT_PX_PER_IN;
  const vh = target.heightPx / VARIANT_PX_PER_IN;
  const m = coverMap(base, vw, vh);
  const ov = overridesOf(target);
  const { printSetup: _p, digitalTargets: _d, ...rest } = base;
  const canvas = { ...base.canvas, widthIn: vw, heightIn: vh };
  if (ov.background?.fit) canvas.backgroundFit = ov.background.fit;
  if (ov.background?.pos) canvas.backgroundPos = ov.background.pos;
  return {
    ...rest,
    id: `${base.id}#${target.id}`,
    mode: "digital",
    canvas,
    elements: base.elements.map((e) => deriveElement(e, m, base, vw, vh, ov.elements?.[e.id])),
  };
}

export type Visibility = "inside" | "partial" | "outside";

// Caja envolvente (sin giro) de un elemento, en pulgadas.
export function elementBounds(e: { x: number; y: number; width: number; height: number; rotation: number }): Rect {
  const c = { x: e.x + e.width / 2, y: e.y + e.height / 2 };
  const pts = [
    { x: e.x, y: e.y }, { x: e.x + e.width, y: e.y }, { x: e.x + e.width, y: e.y + e.height }, { x: e.x, y: e.y + e.height },
  ].map((p) => rotatePoint(p, c, e.rotation));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// Qué elementos visibles de un documento (normalmente el de una variante) quedan dentro, cortados o fuera.
export function elementVisibility(doc: Project): Array<{ id: string; visibility: Visibility }> {
  const W = doc.canvas.widthIn;
  const H = doc.canvas.heightIn;
  const eps = 1e-6;
  return doc.elements.filter((e) => e.visible).map((e) => {
    const b = elementBounds(e);
    const overlaps = b.x < W - eps && b.x + b.width > eps && b.y < H - eps && b.y + b.height > eps;
    const inside = b.x >= -eps && b.y >= -eps && b.x + b.width <= W + eps && b.y + b.height <= H + eps;
    return { id: e.id, visibility: inside ? "inside" : overlaps ? "partial" : "outside" } as const;
  });
}
