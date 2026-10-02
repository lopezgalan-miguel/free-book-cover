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
  // Aviso de ppp efectivos < 300 con el elemento afectado (SDD R-03).
  const low = dpiReport(doc).filter((d) => d.lowDpi).map((d) => {
    const el = doc.elements.find((e) => e.id === d.id);
    const asset = doc.assets.find((a) => a.id === (el?.type === "image" ? el.assetRef.assetId : el?.type === "text" ? (el.texture?.assetId ?? "") : typeof doc.canvas.background === "object" ? doc.canvas.background.assetId : ""));
    const name = d.id === "background" ? t("backgroundName") : typeof asset?.metadata.name === "string" ? asset.metadata.name : t("imageLayer");
    return { id: d.id, text: t("dpiLow", { name, dpi: Math.round(d.dpi) }) };
  });
  const warning = (
    <>
      {nearLimit && <div role="status" className="border-b border-line bg-chip px-[18px] py-2 text-[13px]">{t("projectNearLimit")}</div>}
      {fontProblems.map((p) => (
        <div key={p.family} role="status" data-testid="font-warning" className="border-b border-warn-line bg-warn-bg px-[18px] py-2 text-[13px] text-warn-ink">
          {t(p.reason === "missing" ? "fontNoticeMissing" : "fontNoticeFailed", { family: p.family })}
          {p.reason === "failed" && (
            <button className="ml-3 rounded-md border border-warn-line bg-white px-2.5 py-0.5 text-xs font-medium" onClick={() => void fonts.retryFailed(doc, assets)}>
              {t("fontRetry")}
            </button>
          )}
        </div>
      ))}
      {low.map((l) => (
        <div key={l.id} role="status" data-testid="dpi-warning" className="border-b border-warn-line bg-warn-bg px-[18px] py-2 text-[13px] text-warn-ink">{l.text}</div>
      ))}
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
