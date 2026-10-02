import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";

const MESSAGE: Record<string, DictKey> = {
  quota: "quotaError",
  save: "saveError",
  unsupported_version: "unsupportedVersion",
  load: "loadError",
  storage_unavailable: "storageUnavailable",
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
  const { error, backupParts, nearLimit } = useEditorState();
  const warning = nearLimit ? (
    <div role="status" className="border-b border-line bg-chip px-[18px] py-2 text-[13px]">{t("projectNearLimit")}</div>
  ) : null;
  if (!error || error.kind === "command") return warning;
  const canBackup = error.kind === "quota" || error.kind === "save" || error.kind === "storage_unavailable";
  const text = error.kind === "limit" ? t(LIMIT_MESSAGE[error.error.kind]!) : t(MESSAGE[error.kind]!);
  return (
  <>
    {warning}
    <div role="alert" className="flex items-center justify-between gap-4 border-b border-[#e3c9c4] bg-[#f8e8e5] px-[18px] py-2 text-[13px] text-[#7a2e26]">
      <span>
        {text}
        {backupParts !== null && backupParts > 1 ? ` ${t("backupParts", { n: backupParts })}` : ""}
      </span>
      {canBackup && (
        <button className="rounded-md border border-[#d9aaa3] bg-white px-3 py-1 text-xs font-medium" onClick={() => void store.downloadBackup()}>
          {t("downloadBackup")}
        </button>
      )}
    </div>
  </>
  );
}
