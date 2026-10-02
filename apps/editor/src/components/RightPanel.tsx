import { useI18n } from "../i18n";

export function RightPanel() {
  const { t } = useI18n();
  return (
    <aside className="w-[300px] flex-none overflow-y-auto border-l border-line bg-panel p-4" aria-label={t("style")}>
      <p className="text-xs leading-snug text-muted">{t("selectHint")}</p>
      <div className="mt-3 rounded-[9px] border border-dashed border-[#d5cdbb] bg-[#fbf9f4] px-3 py-2.5 text-xs text-muted">{t("panelPlaceholder")}</div>
    </aside>
  );
}
