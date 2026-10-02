import type { Element, Project } from "../schema/project.js";
import type { FitMode } from "./fit.js";

// Políticas de redimensión del lienzo (SDD R-02):
//  crop    recortar sin distorsión (la imagen cubre su caja)
//  fit     ajustar conservando proporción con espacio libre
//  stretch estirar con posible deformación
export type ResizePolicy = "crop" | "fit" | "stretch";
export const FIT_FOR_POLICY: Record<ResizePolicy, FitMode> = { crop: "cover", fit: "contain", stretch: "fill" };

export interface ResizeTargets {
  background: boolean;
  elementIds: string[];
}

export type ResizeOutcome =
  | { ok: true; canvas: Project["canvas"]; elements: Element[] }
  | { ok: false; missingId: string };

// Los objetivos escalan su caja con el lienzo (sx, sy) y adoptan el modo de
// ajuste de la política; el resto de elementos no se toca (se avisa en la UI si quedan fuera).
export function applyResizePolicy(doc: Project, widthIn: number, heightIn: number, policy: ResizePolicy, targets: ResizeTargets): ResizeOutcome {
  const ids = new Set(targets.elementIds);
  for (const id of ids) if (!doc.elements.some((e) => e.id === id)) return { ok: false, missingId: id };
  const sx = widthIn / doc.canvas.widthIn;
  const sy = heightIn / doc.canvas.heightIn;
  const fit = FIT_FOR_POLICY[policy];
  const canvas: Project["canvas"] = { ...doc.canvas, widthIn, heightIn };
  if (targets.background) canvas.backgroundFit = fit;
  const elements = doc.elements.map((e): Element => {
    if (!ids.has(e.id)) return e;
    const scaled = { ...e, x: e.x * sx, y: e.y * sy, width: e.width * sx, height: e.height * sy };
    return scaled.type === "image" ? { ...scaled, fit } : scaled;
  });
  return { ok: true, canvas, elements };
}
