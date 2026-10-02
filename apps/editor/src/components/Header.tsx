import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useState } from "react";
import { LANGS, type Lang } from "../i18n/dictionaries";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { ExportDialog } from "./ExportDialog";

const iconBtn =
  "h-8 rounded-lg border border-line bg-white px-3 text-[12.5px] text-ink enabled:hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40";

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="rounded bg-ink px-2 py-1 text-xs text-white" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const store = useStore();
  const state = useEditorState();
  const doc = state.history.present;
  const dirty = store.isDirty();
  const [exportOpen, setExportOpen] = useState(false);
  const status = state.status === "saving" ? t("saving") : dirty ? t("unsaved") : state.status === "saved" ? t("saved") : "";

  return (
    <Tooltip.Provider delayDuration={300}>
      <header className="z-10 flex h-14 flex-none items-center justify-between border-b border-line bg-panel px-[18px]">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink font-serif text-base leading-none text-paper">P</div>
          <div className="text-sm font-semibold tracking-[.01em]">{t("appName")}</div>
          <div className="rounded-full border border-line px-[7px] py-0.5 font-mono text-[11px] text-muted">{t("badge")}</div>
        </div>
        <div className="flex items-center gap-3.5">
          <ToggleGroup.Root
            type="single"
            value={lang}
            aria-label={t("langLabel")}
            onValueChange={(v) => v && setLang(v as Lang)}
            className="flex gap-0.5 rounded-lg bg-chip p-0.5"
          >
            {LANGS.map((l) => (
              <ToggleGroup.Item
                key={l}
                value={l}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-accent-dark data-[state=on]:bg-white data-[state=on]:text-ink"
              >
                {l.toUpperCase()}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
          <div className="font-mono text-xs text-muted" data-testid="dims">
            {doc.canvas.widthIn} × {doc.canvas.heightIn} in
          </div>
          <Tip label={t("undo")}>
            <button className={iconBtn} aria-label={t("undo")} disabled={!store.canUndo()} onClick={() => store.undo()}>↶</button>
          </Tip>
          <Tip label={t("redo")}>
            <button className={iconBtn} aria-label={t("redo")} disabled={!store.canRedo()} onClick={() => store.redo()}>↷</button>
          </Tip>
          <span className="min-w-28 text-right text-xs text-muted" role="status">{status}</span>
          <button className={iconBtn} onClick={() => void store.save()} disabled={state.status === "saving"}>
            {t("save")}
          </button>
          <button className="rounded-lg bg-accent px-[18px] py-[9px] text-[13px] font-semibold text-white hover:brightness-110" onClick={() => setExportOpen(true)}>
            {t("exportBtn")}
          </button>
        </div>
      </header>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </Tooltip.Provider>
  );
}
