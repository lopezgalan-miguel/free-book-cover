import { dpiReport, type DpiEntry } from "../render/renderDocument.js";
import type { Project } from "../schema/project.js";
import { bindingOf, type PrintSetup } from "./kdp.js";
import { applyPrintSetup } from "./recalc.js";

// La tapa dura exige 300 ppp en todas las imágenes impresas (fondo, capas de imagen y texturas de texto):
// es más grande que la tapa blanda y la misma imagen rinde menos. En tapa blanda solo avisa la preimpresión.

// Imágenes que quedarían por debajo de 300 ppp si se aplicaran estos datos de impresión.
export function lowDpiForSetup(doc: Project, setup: PrintSetup): DpiEntry[] {
  return dpiReport({ ...doc, ...applyPrintSetup(doc, setup) }).filter((e) => e.lowDpi);
}

// Imágenes por debajo de 300 ppp de una cubierta de tapa dura; [] si no lo es.
export function hardcoverLowDpi(doc: Project): DpiEntry[] {
  if (doc.mode !== "kdp-paperback" || !doc.printSetup || bindingOf(doc.printSetup) !== "hardcover") return [];
  return dpiReport(doc).filter((e) => e.lowDpi);
}
