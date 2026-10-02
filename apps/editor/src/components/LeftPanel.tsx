import type { Element, TextElement } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";

const sectionTitle = "mb-2.5 text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted";

const layerLabel = (e: TextElement) => e.runs.map((r) => r.text).join("") || "—";
const isText = (e: Element): e is TextElement => e.type === "text";

export function LeftPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history } = useEditorState();
  const doc = history.present;
  const layers = doc.elements.filter(isText).sort((a, b) => b.zIndex - a.zIndex);

  const addText = () => {
    store.dispatch({
      type: "addElement",
      element: {
        id: store.newId(), type: "text", x: doc.canvas.widthIn / 4, y: doc.canvas.heightIn * 0.65,
        width: doc.canvas.widthIn / 2, height: 1, rotation: 0, zIndex: 0, visible: true,
        runs: [{ text: t("newText"), fontFamily: "Lora", fontSizePt: 36, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
        align: "center", lineHeight: 1.2, letterSpacing: 0.02,
        shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
      },
    });
  };

  return (
    <aside className="w-[264px] flex-none overflow-y-auto border-r border-line bg-panel" aria-label={t("layers")}>
      <section className="border-b border-line-soft p-4">
        <div className={sectionTitle}>{t("bg")}</div>
        <div className="rounded-[9px] border border-dashed border-[#d5cdbb] bg-[#fbf9f4] px-3 py-2.5 text-xs text-muted">{t("panelPlaceholder")}</div>
      </section>
      <section className="border-b border-line-soft p-4">
        <div className={sectionTitle}>{t("canvas")}</div>
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="mb-1 text-[10px] text-muted">{t("widthIn")}</div>
            <div className="rounded-[7px] border border-[#e0d8c8] bg-white px-[9px] py-[7px] font-mono text-[12.5px]">{doc.canvas.widthIn}</div>
          </div>
          <div className="flex items-end pb-2 text-[#c4bcac]">×</div>
          <div className="flex-1">
            <div className="mb-1 text-[10px] text-muted">{t("heightIn")}</div>
            <div className="rounded-[7px] border border-[#e0d8c8] bg-white px-[9px] py-[7px] font-mono text-[12.5px]">{doc.canvas.heightIn}</div>
          </div>
        </div>
      </section>
      <section className="p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted">{t("layers")}</div>
          <button
            aria-label={t("addText")}
            onClick={addText}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-[#e0d8c8] bg-white text-base leading-none text-accent-dark hover:bg-chip"
          >
            +
          </button>
        </div>
        {layers.length === 0 ? (
          <p className="text-xs text-muted">{t("noLayers")}</p>
        ) : (
          <ul className="flex flex-col gap-[5px]">
            {layers.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-2.5 py-2">
                <span className="flex-none text-[15px] leading-none" style={{ fontFamily: l.runs[0]?.fontFamily }}>Aa</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs">{layerLabel(l)}</div>
                  <div className="truncate text-[10px] text-muted">{l.runs[0]?.fontFamily}</div>
                </div>
                <button
                  aria-label={t("removeLayer")}
                  onClick={() => store.dispatch({ type: "removeElement", id: l.id })}
                  className="px-1 text-[15px] leading-none text-[#c4bcac] hover:text-[#b4453a]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
