import { facesText } from "../fonts/facesText";
import { cachedDpiReport as dpiReport } from "../panels/dpiCache";
import { useFonts, useFontProblems } from "../fonts/fontContext";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";

const MESSAGE: Record<string, DictKey> = {
  quota: "quotaError",
  save: "saveError",
  unsupported_version: "unsupportedVersion",
  load: "loadError",
  storage_unavailable: "storageUnavailable",
  unsupported_image: "unsupportedImage",
  unsupported_font: "unsupportedFont",
  restore: "restoreError",
};

const LIMIT_MESSAGE: Record<string, DictKey> = {
  image_too_large: "limitImageSize",
  image_too_many_megapixels: "limitImageMpx",
  font_too_large: "limitFontSize",
  project_too_large: "limitProjectSize",
  invalid_size: "limitInvalid",
};

export function Notices() {
  const { t } = useI18n();
  const store = useStore();
  const { error, backupParts, nearLimit, history, assets } = useEditorState();
  const fonts = useFonts();
  const doc = history.present;
  const fontProblems = useFontProblems();
  // Aviso de ppp efectivos < 300 con el recurso afectado (SDD R-03), en una sola franja: el mismo recurso
  // con los mismos ppp en varias capas se cuenta («× 3») en vez de repetirse.
  const lowItems = new Map<string, { name: string; dpi: number; count: number }>();
  for (const d of dpiReport(doc).filter((x) => x.lowDpi)) {
    const el = doc.elements.find((e) => e.id === d.id);
    const asset = doc.assets.find((a) => a.id === (el?.type === "image" ? el.assetRef.assetId : el?.type === "text" ? (el.texture?.assetId ?? "") : typeof doc.canvas.background === "object" ? doc.canvas.background.assetId : ""));
    const name = d.id === "background" ? t("backgroundName") : typeof asset?.metadata.name === "string" ? asset.metadata.name : t("imageLayer");
    const dpi = Math.round(d.dpi);
    const key = `${name}|${dpi}`;
    const prev = lowItems.get(key);
    lowItems.set(key, { name, dpi, count: (prev?.count ?? 0) + 1 });
  }
  const lowList = [...lowItems.values()];
  const lowText = lowList.length === 1 && lowList[0]!.count === 1
    ? t("dpiLow", { name: lowList[0]!.name, dpi: lowList[0]!.dpi })
    : t("dpiLowMany", { list: lowList.map((l) => `${l.name} (${l.dpi} ppp${l.count > 1 ? ` × ${l.count}` : ""})`).join(", ") });
  const warning = (
    <>
      {nearLimit && <div role="status" className="border-b border-line bg-chip px-[18px] py-2 text-[13px]">{t("projectNearLimit")}</div>}
      {fontProblems.map((p) => (
        <div key={p.family} role="status" data-testid="font-warning" className="border-b border-warn-line bg-warn-bg px-[18px] py-2 text-[13px] text-warn-ink">
          {t(p.reason === "missing" ? "fontNoticeMissing" : p.reason === "face_missing" ? "fontNoticeFace" : "fontNoticeFailed", { family: p.family, faces: facesText(p) })}
          {p.reason === "failed" && (
            <button className="ml-3 rounded-md border border-warn-line bg-white px-2.5 py-0.5 text-xs font-medium" onClick={() => void fonts.retryFailed(doc, assets)}>
              {t("fontRetry")}
            </button>
          )}
        </div>
      ))}
      {lowList.length > 0 && (
        <div role="status" data-testid="dpi-warning" className="border-b border-warn-line bg-warn-bg px-[18px] py-2 text-[13px] text-warn-ink">{lowText}</div>
      )}
    </>
  );
  if (!error || error.kind === "command") return warning;
  const canBackup = error.kind === "quota" || error.kind === "save" || error.kind === "storage_unavailable";
  const text =
    error.kind === "limit" ? t(LIMIT_MESSAGE[error.error.kind]!)
    : error.kind === "font_load_failed" ? t("fontLoadFailed", { family: error.family })
    : t(MESSAGE[error.kind]!);
  return (
  <>
    {warning}
    <div role="alert" className="flex items-center justify-between gap-4 border-b border-danger-line bg-danger-bg px-[18px] py-2 text-[13px] text-danger-ink">
      <span>
        {text}
        {backupParts !== null && backupParts > 1 ? ` ${t("backupParts", { n: backupParts })}` : ""}
      </span>
      {canBackup && (
        <button className="rounded-md border border-danger-line bg-white px-3 py-1 text-xs font-medium" onClick={() => void store.downloadBackup()}>
          {t("downloadBackup")}
        </button>
      )}
    </div>
  </>
  );
}
