import type { Element, Project } from "../schema/project.js";
import { rotatedBounds } from "./review.js";
import { kdpLayout, zoneAt, type KdpLayout, type PrintSetup } from "./kdp.js";

// Reposiciona (sin cambiar tamaños ni giros) los elementos al pasar de una disposición a otra.
// Regla: cada elemento pertenece a la cara donde cae su centro y se ancla a lo que queda más cerca:
//  - contraportada y portada: al borde izquierdo o derecho de su cara, según la mitad en la que esté;
//  - lomo: se mantiene centrado en el lomo;
//  - vertical: al borde superior o inferior, según la mitad del lienzo en la que esté.
// Así, al cambiar solo las páginas, la contraportada no se mueve y la portada se desplaza el cambio del lomo.
export function repositionElements(elements: Element[], from: KdpLayout, to: KdpLayout): Element[] {
  return elements.map((e) => {
    const b = rotatedBounds(e);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const zone = zoneAt(from, cx);
    let dx: number;
    if (zone === "spine") {
      dx = to.spine.x + to.spine.width / 2 - (from.spine.x + from.spine.width / 2);
    } else {
      const a = from[zone];
      const n = to[zone];
      dx = cx < a.x + a.width / 2 ? n.x - a.x : n.x + n.width - (a.x + a.width);
    }
    const dy = cy < from.heightIn / 2 ? 0 : to.heightIn - from.heightIn;
    if (dx === 0 && dy === 0) return e;
    return { ...e, x: e.x + dx, y: e.y + dy };
  });
}

// Disposición actual del documento, si ya tiene datos de impresión.
export function currentLayout(doc: Project): KdpLayout | null {
  return doc.printSetup ? kdpLayout(doc.printSetup) : null;
}

export function applyPrintSetup(doc: Project, setup: PrintSetup): Pick<Project, "mode" | "printSetup" | "canvas" | "elements"> {
  const to = kdpLayout(setup);
  const from = currentLayout(doc);
  return {
    mode: "kdp-paperback",
    printSetup: setup,
    canvas: { ...doc.canvas, widthIn: to.widthIn, heightIn: to.heightIn },
    elements: from ? repositionElements(doc.elements, from, to) : doc.elements,
  };
}
