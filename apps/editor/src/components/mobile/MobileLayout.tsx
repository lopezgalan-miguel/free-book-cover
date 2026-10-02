import { useRef, useState, type KeyboardEvent } from "react";
import { MOBILE_TABS, TAB_TEXT_SECTIONS, closeSheet, initialSheet, nextTab, pressTab, type MobileTab } from "../../layout/mobileTabs";
import { useI18n } from "../../i18n";
import type { DictKey } from "../../i18n/dictionaries";
import { BackgroundPanel } from "../../panels/BackgroundPanel";
import { CanvasPanel } from "../../panels/CanvasPanel";
import { GeometryPanel } from "../../panels/GeometryPanel";
import { KdpPanel } from "../../panels/KdpPanel";
import { LayersPanel } from "../../panels/LayersPanel";
import { TextPanel } from "../../panels/TextPanel";
import { VariantsPanel } from "../../panels/VariantsPanel";
import { useEditorState, useStore } from "../../store/react";
import { ExportDialog } from "../ExportDialog";
import { LangToggle } from "../Header";
import { Notices } from "../Notices";
import { Stage } from "../Stage";
import { BottomSheet } from "./BottomSheet";

const TAB_LABEL: Record<MobileTab, DictKey> = { text: "tabText", font: "tabFont", color: "tabColor", style: "tabStyle", canvas: "tabCanvas" };
const TAB_ICON: Record<MobileTab, string> = { text: "T", font: "✦", color: "◐", style: "≡", canvas: "▢" };
const TAB_TITLE: Record<MobileTab, DictKey> = { text: "tabText", font: "tabFont", color: "tabColor", style: "sheetTitleStyle", canvas: "tabCanvas" };
const barBtn = "rounded-lg border border-line bg-white px-3 text-[13px] text-ink enabled:hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40";

// Contenedor móvil (SDD R-10): barra superior, lienzo, barra de pestañas y hoja inferior.
// Los paneles son exactamente los del escritorio; solo cambia dónde se montan.
export function MobileLayout() {
  const { t } = useI18n();
  const [sheet, setSheet] = useState(initialSheet);
  const [exportOpen, setExportOpen] = useState(false);
  const tabs = useRef<Partial<Record<MobileTab, HTMLButtonElement | null>>>({});

  const onTabKey = (tab: MobileTab) => (e: KeyboardEvent) => {
    const next = nextTab(tab, e.key);
    if (!next) return;
    e.preventDefault();
    tabs.current[next]?.focus();
  };

  return (
    <div data-layout="mobile" className="flex h-dvh w-full flex-col overflow-hidden bg-stage">
      <MobileBar onExport={() => setExportOpen(true)} />
      <div className="max-h-24 flex-none overflow-y-auto bg-bg"><Notices /></div>
      <Stage />
      <nav aria-label={t("tabsLabel")} className="flex-none border-t border-line bg-panel pb-[max(env(safe-area-inset-bottom),6px)]">
        <div role="toolbar" aria-label={t("tabsLabel")} className="flex">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab} type="button" ref={(el) => void (tabs.current[tab] = el)} data-testid={`tab-${tab}`}
              aria-haspopup="dialog" aria-expanded={sheet.open && sheet.tab === tab}
              onKeyDown={onTabKey(tab)} onClick={() => setSheet((s) => pressTab(s, tab))}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-ink aria-expanded:text-accent-dark"
            >
              <span aria-hidden className="text-[19px] leading-none">{TAB_ICON[tab]}</span>
              <span className="text-[11px] font-medium">{t(TAB_LABEL[tab])}</span>
            </button>
          ))}
        </div>
      </nav>
      {sheet.open && (
        <BottomSheet title={t(TAB_TITLE[sheet.tab])} onClose={() => setSheet(closeSheet)}>
          <SheetContent tab={sheet.tab} />
        </BottomSheet>
      )}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function MobileBar({ onExport }: { onExport: () => void }) {
  const { t } = useI18n();
  const store = useStore();
  const state = useEditorState();
  const doc = state.history.present;
  const status = state.status === "saving" ? t("saving") : store.isDirty() ? t("unsaved") : state.status === "saved" ? t("saved") : "";
  return (
    <header aria-label={t("mobileBar")} className="flex-none border-b border-line bg-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <LangToggle />
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold leading-none">{t("appName")}</div>
          <div className="mt-0.5 font-mono text-[10px] text-subtle" data-testid="dims">{doc.canvas.widthIn} × {doc.canvas.heightIn} in</div>
        </div>
        <button type="button" onClick={onExport} className="rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent">{t("exportBtn")}</button>
      </div>
      <div className="flex items-center gap-2 border-t border-line-soft px-3 py-1">
        <button type="button" className={barBtn} aria-label={t("undo")} disabled={!store.canUndo()} onClick={() => store.undo()}>↶</button>
        <button type="button" className={barBtn} aria-label={t("redo")} disabled={!store.canRedo()} onClick={() => store.redo()}>↷</button>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-subtle" role="status">{status}</span>
        <button type="button" className={barBtn} onClick={() => void store.save()} disabled={state.status === "saving"}>{t("save")}</button>
      </div>
    </header>
  );
}

function SheetContent({ tab }: { tab: MobileTab }) {
  const { t } = useI18n();
  const { history, selectedId } = useEditorState();
  const sections = TAB_TEXT_SECTIONS[tab];
  const hasText = history.present.elements.some((e) => e.id === selectedId && e.type === "text");
  if (tab === "canvas") {
    return (
      <>
        <BackgroundPanel />
        <CanvasPanel />
        <KdpPanel />
        <VariantsPanel />
        <div className="border-t border-line-soft p-4"><GeometryPanel /></div>
      </>
    );
  }
  return (
    <>
      {tab === "text" && <LayersPanel />}
      {sections && <TextPanel sections={sections} />}
      {tab !== "text" && !hasText && <p className="p-4 text-[13px] leading-snug text-subtle">{t("sheetNeedsText")}</p>}
    </>
  );
}
