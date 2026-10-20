import type { DpiEntry, Project } from "@free-book-cover/core";
import type { DictKey } from "../i18n/dictionaries";

type T = (k: DictKey, v?: Record<string, string | number>) => string;

// Nombre legible de una imagen del informe de ppp: el fondo, una capa de imagen o la textura de un texto.
export function dpiEntryName(t: T, doc: Project, e: DpiEntry): string {
  if (e.id === "background") return t("dpiBackground");
  const el = doc.elements.find((x) => x.id === e.id);
  if (el?.type === "text") return t("dpiTexture", { name: el.runs.map((r) => r.text).join("").trim().slice(0, 24) || t("newText") });
  return t("dpiImageLayer");
}
