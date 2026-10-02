import { formatBytes, type PreflightCheck } from "@free-book-cover/core";
import type { DictKey } from "../i18n/dictionaries";
import type { PdfResult } from "./exportPdf";

export type Translate = (key: DictKey, vars?: Record<string, string | number>) => string;

const r2 = (n: unknown) => (typeof n === "number" ? Math.round(n * 100) / 100 : n);

// Texto legible (ES/CA) de una comprobación: título y detalle a partir de su id, estado y parámetros.
export function checkTitle(t: Translate, c: PreflightCheck): string {
  return t(`pfc_${c.id}` as DictKey);
}
export function checkDetail(t: Translate, c: PreflightCheck): string {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(c.params ?? {})) p[k] = r2(v) as string | number;
  if (typeof c.params?.bytes === "number") p.mb = (c.params.bytes / (1024 * 1024)).toFixed(1);
  return t(`pfd_${c.id}_${c.status}` as DictKey, p);
}
export const statusLabel = (t: Translate, c: PreflightCheck): string => t(`pfs_${c.status}` as DictKey);

// Informe descargable que acompaña al PDF (R-07).
export function reportText(t: Translate, r: PdfResult): string {
  const s = r.summary;
  const out = [
    t("pdfReportTitle"),
    `${r.fileName}`,
    `${r.widthIn} × ${r.heightIn} in · ${r.sizePx.widthPx}×${r.sizePx.heightPx} px${r.pdf ? ` · ${formatBytes(r.pdf.size)}` : ""}`,
    "",
    s.state === "ready" ? t("pdfReady").toUpperCase() : t("pdfNotValidated"),
    "",
    ...s.checks.map((c) => `[${statusLabel(t, c)}] ${checkTitle(t, c)}: ${checkDetail(t, c)}`),
    "",
    t("pdfDisclaimer"),
  ];
  return out.join("\n") + "\n";
}
