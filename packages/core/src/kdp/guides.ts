import type { Rect } from "../geometry/fit.js";
import type { KdpLayout } from "./kdp.js";

// Primitivas de las guías (pulgadas). La vista las dibuja en una capa que nunca forma parte de la exportación.
export type GuideShape =
  | { kind: "bleed"; rect: Rect }
  | { kind: "trim"; rect: Rect }
  | { kind: "safe"; rect: Rect }
  | { kind: "spineSafe"; rect: Rect }
  | { kind: "fold"; x: number; y1: number; y2: number }
  | { kind: "barcode"; rect: Rect };

export function kdpGuides(l: KdpLayout): GuideShape[] {
  const b = l.bleedIn;
  const trimW = l.widthIn - 2 * b;
  const trimH = l.heightIn - 2 * b;
  const out: GuideShape[] = [
    // Banda de sangrado: cuatro franjas entre el borde del lienzo y la línea de corte.
    { kind: "bleed", rect: { x: 0, y: 0, width: l.widthIn, height: b } },
    { kind: "bleed", rect: { x: 0, y: l.heightIn - b, width: l.widthIn, height: b } },
    { kind: "bleed", rect: { x: 0, y: b, width: b, height: trimH } },
    { kind: "bleed", rect: { x: l.widthIn - b, y: b, width: b, height: trimH } },
    { kind: "trim", rect: { x: b, y: b, width: trimW, height: trimH } },
    { kind: "safe", rect: l.safe.back },
    { kind: "safe", rect: l.safe.front },
    { kind: "fold", x: l.folds[0], y1: 0, y2: l.heightIn },
    { kind: "fold", x: l.folds[1], y1: 0, y2: l.heightIn },
    { kind: "barcode", rect: l.barcode },
  ];
  if (l.spineSafe) out.push({ kind: "spineSafe", rect: l.spineSafe });
  return out;
}
