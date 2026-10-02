import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";

const MESSAGE: Record<string, DictKey> = {
  quota: "quotaError",
  save: "saveError",
  unsupported_version: "unsupportedVersion",
  load: "loadError",
};

export function Notices() {
  const { t } = useI18n();
  const store = useStore();
  const { error, backupParts } = useEditorState();
  if (!error || error.kind === "command") return null;
  const canBackup = error.kind === "quota" || error.kind === "save";
  return (
    <div role="alert" className="flex items-center justify-between gap-4 border-b border-[#e3c9c4] bg-[#f8e8e5] px-[18px] py-2 text-[13px] text-[#7a2e26]">
      <span>
        {t(MESSAGE[error.kind]!)}
        {backupParts !== null && backupParts > 1 ? ` ${t("backupParts", { n: backupParts })}` : ""}
      </span>
      {canBackup && (
        <button className="rounded-md border border-[#d9aaa3] bg-white px-3 py-1 text-xs font-medium" onClick={() => void store.downloadBackup()}>
          {t("downloadBackup")}
        </button>
      )}
    </div>
  );
}
