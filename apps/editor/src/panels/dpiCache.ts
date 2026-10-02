import { dpiReport, type DpiEntry, type Project } from "@free-book-cover/core";

// El documento es inmutable: un informe por versión evita recomponer en cada panel.
const cache = new WeakMap<Project, DpiEntry[]>();
export function cachedDpiReport(doc: Project): DpiEntry[] {
  let r = cache.get(doc);
  if (!r) cache.set(doc, (r = dpiReport(doc)));
  return r;
}
