import { applyResizePolicy, type ResizePolicy, type ResizeTargets } from "../geometry/resize.js";
import { overridesOf } from "../variants/variants.js";
import { projectSchema, type Asset, type BackgroundOverride, type DigitalTarget, type Element, type ElementOverride, type ImageElement, type Project, type ShapeElement, type TextElement } from "../schema/project.js";

// Campos que un updateElement no puede tocar: identidad, tipo y orden de apilado.
type Immutable = "id" | "type" | "zIndex";
export type ElementPatch =
  | Partial<Omit<TextElement, Immutable>>
  | Partial<Omit<ImageElement, Immutable>>
  | Partial<Omit<ShapeElement, Immutable>>;

export type Command =
  // El elemento entra siempre en lo más alto de la pila: su zIndex de entrada se ignora.
  | { type: "addElement"; element: Element }
  | { type: "updateElement"; id: string; props: ElementPatch }
  | { type: "removeElement"; id: string }
  // toIndex: posición en la pila de apilado (0 = fondo), acotada a [0, n-1].
  | { type: "reorderElement"; id: string; toIndex: number }
  | { type: "setCanvas"; widthIn: number; heightIn: number }
  | { type: "setBackground"; background: Project["canvas"]["background"] }
  // Encuadre del fondo: modo de ajuste y/o posición (0..1).
  | { type: "setBackgroundLayout"; fit?: "cover" | "contain" | "fill"; pos?: { x: number; y: number } }
  // Cambia el tamaño aplicando la política a los objetivos, en un solo paso atómico (un único deshacer).
  | { type: "resizeCanvas"; widthIn: number; heightIn: number; policy: ResizePolicy; targets: ResizeTargets }
  | { type: "addAsset"; asset: Asset }
  | { type: "removeAsset"; id: string }
  // Variantes digitales (SDD R-08): cada una tiene sus propios ajustes y no toca el base ni a las demás.
  | { type: "addDigitalTarget"; target: DigitalTarget }
  | { type: "removeDigitalTarget"; id: string }
  | { type: "setVariantElement"; targetId: string; elementId: string; props: ElementOverride }
  | { type: "resetVariantElement"; targetId: string; elementId: string }
  | { type: "setVariantBackground"; targetId: string; props: BackgroundOverride }
  // Borra todos los ajustes de la variante (vuelve a la derivación por defecto).
  | { type: "resetVariant"; targetId: string };

export type CommandError =
  | { kind: "invalid"; issues: string[] }
  | { kind: "conflict"; expectedRevision: number; actualRevision: number }
  | { kind: "not_found"; id: string };

export type CommandResult = { ok: true; doc: Project } | { ok: false; error: CommandError };

const invalid = (...issues: string[]): CommandResult => ({ ok: false, error: { kind: "invalid", issues } });
const notFound = (id: string): CommandResult => ({ ok: false, error: { kind: "not_found", id } });

const FORBIDDEN = new Set<string>(["id", "type", "zIndex"]);

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// Pila ordenada por zIndex (estable respecto al orden del array).
function stacking(elements: Element[]): Element[] {
  return elements.map((e, i) => [e, i] as const).sort((a, b) => a[0].zIndex - b[0].zIndex || a[1] - b[1]).map(([e]) => e);
}

// Sustituye los ajustes de una variante; error si no existe.
function withTarget(doc: Project, id: string, change: (t: DigitalTarget) => DigitalTarget): Project | CommandResult {
  const targets = doc.digitalTargets ?? [];
  if (!targets.some((t) => t.id === id)) return notFound(id);
  return { ...doc, digitalTargets: targets.map((t) => (t.id === id ? change(t) : t)) };
}
// Calcula el documento candidato (sin validar ni numerar la revisión).
function build(doc: Project, cmd: Command): Project | CommandResult {
  switch (cmd.type) {
    case "addElement": {
      const top = doc.elements.reduce((m, e) => Math.max(m, e.zIndex + 1), 0);
      return { ...doc, elements: [...doc.elements, { ...cmd.element, zIndex: top }] };
    }
    case "updateElement": {
      const current = doc.elements.find((e) => e.id === cmd.id);
      if (!current) return notFound(cmd.id);
      const bad = Object.keys(cmd.props).filter((k) => FORBIDDEN.has(k));
      if (bad.length) return invalid(...bad.map((k) => `propiedad no modificable: ${k}`));
      const next = stripUndefined({ ...current, ...cmd.props }) as Element;
      return { ...doc, elements: doc.elements.map((e) => (e.id === cmd.id ? next : e)) };
    }
    case "removeElement": {
      if (!doc.elements.some((e) => e.id === cmd.id)) return notFound(cmd.id);
      // Los ajustes de variantes de un elemento borrado se retiran en el mismo paso atómico.
      const digitalTargets = doc.digitalTargets?.map((t) => {
        const ov = overridesOf(t);
        if (!ov.elements || !(cmd.id in ov.elements)) return t;
        const { [cmd.id]: _gone, ...elements } = ov.elements;
        return { ...t, layoutOverrides: { ...ov, elements } };
      });
      return { ...doc, elements: doc.elements.filter((e) => e.id !== cmd.id), ...(digitalTargets ? { digitalTargets } : {}) };
    }
    case "reorderElement": {
      if (!doc.elements.some((e) => e.id === cmd.id)) return notFound(cmd.id);
      if (!Number.isFinite(cmd.toIndex)) return invalid("toIndex no es un número finito");
      const stack = stacking(doc.elements);
      const from = stack.findIndex((e) => e.id === cmd.id);
      const [moved] = stack.splice(from, 1);
      const to = Math.max(0, Math.min(stack.length, Math.trunc(cmd.toIndex)));
      stack.splice(to, 0, moved!);
      const z = new Map(stack.map((e, i) => [e.id, i]));
      return { ...doc, elements: doc.elements.map((e) => ({ ...e, zIndex: z.get(e.id)! })) };
    }
    case "setCanvas":
      return { ...doc, canvas: { ...doc.canvas, widthIn: cmd.widthIn, heightIn: cmd.heightIn } };
    case "setBackground": {
      // El encuadre pertenece al fondo: al cambiarlo vuelve a cover y centrado.
      const { backgroundFit: _f, backgroundPos: _p, ...rest } = doc.canvas;
      return { ...doc, canvas: { ...rest, background: cmd.background } };
    }
    case "setBackgroundLayout": {
      const canvas = { ...doc.canvas };
      if (cmd.fit !== undefined) canvas.backgroundFit = cmd.fit;
      if (cmd.pos !== undefined) canvas.backgroundPos = cmd.pos;
      return { ...doc, canvas };
    }
    case "resizeCanvas": {
      const r = applyResizePolicy(doc, cmd.widthIn, cmd.heightIn, cmd.policy, cmd.targets);
      if (!r.ok) return notFound(r.missingId);
      return { ...doc, canvas: r.canvas, elements: r.elements };
    }
    case "addAsset":
      return { ...doc, assets: [...doc.assets, cmd.asset] };
    case "removeAsset": {
      if (!doc.assets.some((a) => a.id === cmd.id)) return notFound(cmd.id);
      return { ...doc, assets: doc.assets.filter((a) => a.id !== cmd.id) };
    }
    case "addDigitalTarget":
      return { ...doc, digitalTargets: [...(doc.digitalTargets ?? []), cmd.target] };
    case "removeDigitalTarget": {
      const targets = doc.digitalTargets ?? [];
      if (!targets.some((t) => t.id === cmd.id)) return notFound(cmd.id);
      return { ...doc, digitalTargets: targets.filter((t) => t.id !== cmd.id) };
    }
    case "setVariantElement": {
      if (!doc.elements.some((e) => e.id === cmd.elementId)) return notFound(cmd.elementId);
      return withTarget(doc, cmd.targetId, (t) => {
        const ov = overridesOf(t);
        const merged = stripUndefined({ ...(ov.elements?.[cmd.elementId] ?? {}), ...cmd.props });
        return { ...t, layoutOverrides: { ...ov, elements: { ...ov.elements, [cmd.elementId]: merged } } };
      });
    }
    case "resetVariantElement":
      return withTarget(doc, cmd.targetId, (t) => {
        const ov = overridesOf(t);
        const { [cmd.elementId]: _gone, ...elements } = ov.elements ?? {};
        return { ...t, layoutOverrides: { ...ov, elements } };
      });
    case "setVariantBackground":
      return withTarget(doc, cmd.targetId, (t) => {
        const ov = overridesOf(t);
        return { ...t, layoutOverrides: { ...ov, background: stripUndefined({ ...(ov.background ?? {}), ...cmd.props }) } };
      });
    case "resetVariant":
      return withTarget(doc, cmd.targetId, (t) => ({ ...t, layoutOverrides: {} }));
  }
}

// Única vía de mutación. No modifica `doc`; atómica: o devuelve un documento
// válido con revision + 1, o un error y nada cambia.
export function applyCommand(doc: Project, cmd: Command, expectedRevision: number): CommandResult {
  if (expectedRevision !== doc.revision) {
    return { ok: false, error: { kind: "conflict", expectedRevision, actualRevision: doc.revision } };
  }
  const built = build(doc, cmd);
  if ("ok" in built) return built;
  const parsed = projectSchema.safeParse({ ...built, revision: doc.revision + 1 });
  if (!parsed.success) return invalid(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  return { ok: true, doc: parsed.data };
}
