import { applyResizePolicy, type ResizePolicy, type ResizeTargets } from "../geometry/resize.js";
import { projectSchema, type Asset, type Element, type ImageElement, type Project, type ShapeElement, type TextElement } from "../schema/project.js";

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
  | { type: "removeAsset"; id: string };

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
      return { ...doc, elements: doc.elements.filter((e) => e.id !== cmd.id) };
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
