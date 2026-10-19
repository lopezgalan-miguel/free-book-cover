import type { Element } from "../schema/project.js";

// Propiedades de estilo que viven en cada tramo de texto (no en el bloque).
export const TEXT_RUN_KEYS: readonly string[] = ["fontFamily", "fontSizePt", "weight", "italic", "underline", "uppercase", "color", "stretch"];
// Cambios que alteran la maquetación del texto: la altura de la caja se recalcula.
export const TEXT_RELAYOUT_KEYS: readonly string[] = ["fontFamily", "fontSizePt", "weight", "italic", "uppercase", "lineHeight", "letterSpacing", "width", "curvature", "scaleX", "stretch"];

const GEOMETRY_KEYS = ["x", "y", "width", "height", "rotation", "visible", "opacity"];
// Record exhaustivo: un tipo de elemento nuevo no compila hasta declarar qué se puede editar.
const TYPE_KEYS: Record<Element["type"], readonly string[]> = {
  text: [...TEXT_RUN_KEYS, "align", "lineHeight", "letterSpacing", "shadow", "outline", "curvature", "scaleX", "texture", "innerShadow", "mask"],
  image: ["fit", "crop", "filters"],
  shape: ["fill", "stroke"],
};

export function editableKeys(type: Element["type"]): ReadonlySet<string> {
  return new Set([...GEOMETRY_KEYS, ...TYPE_KEYS[type]]);
}

export const needsRelayout = (style: Record<string, unknown>): boolean => TEXT_RELAYOUT_KEYS.some((k) => style[k] !== undefined);

// Convierte un estilo plano en el parche de updateElement: en texto, lo de tramo va a todos los tramos.
export function styleToPatch(el: Element, style: Record<string, unknown>): Record<string, unknown> {
  const defined = Object.entries(style).filter(([, v]) => v !== undefined);
  if (el.type !== "text") return Object.fromEntries(defined);
  const isRun = (k: string) => TEXT_RUN_KEYS.includes(k);
  const patch: Record<string, unknown> = Object.fromEntries(defined.filter(([k]) => !isRun(k)));
  const runPatch = Object.fromEntries(defined.filter(([k]) => isRun(k)));
  if (Object.keys(runPatch).length) patch.runs = el.runs.map((r) => ({ ...r, ...runPatch }));
  return patch;
}
