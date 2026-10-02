import { cachedDpiReport as dpiReport } from "./dpiCache";
import { type Element, type ImageElement, type TextElement } from "@free-book-cover/core";
import { useRef } from "react";
import { useAssetUrl } from "../canvas/useImageSources";
import { importImage } from "../images/importImage";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { Section } from "./ui";

const layerLabel = (e: TextElement) => e.runs.map((r) => r.text).join("") || "—";
const isText = (e: Element): e is TextElement => e.type === "text";
const isImage = (e: Element): e is ImageElement => e.type === "image";
const plus = "flex h-6 w-6 items-center justify-center rounded-md border border-field bg-white text-base leading-none text-accent-dark hover:bg-chip";
const miniBtn = "px-1 text-[13px] leading-none text-faint enabled:hover:text-ink disabled:opacity-30";

function Row({ element, children, thumb, name, sub, dpiLow }: { element: Element; children?: never; thumb: React.ReactNode; name: string; sub: string; dpiLow?: string | undefined }) {
  const { t } = useI18n();
  const store = useStore();
  const { history, selectedId } = useEditorState();
  const stack = [...history.present.elements].sort((a, b) => a.zIndex - b.zIndex);
  const index = stack.findIndex((e) => e.id === element.id);
  const selected = selectedId === element.id;
  return (
    <li className={`flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 ${selected ? "border-accent" : "border-line"}`}>
      <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-current={selected || undefined} onClick={() => store.select(element.id)}>
        {thumb}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{name}</span>
          <span className="block truncate text-[10px] text-muted">{sub}</span>
          {dpiLow && <span className="block text-[10px] font-medium text-warn-ink">{dpiLow}</span>}
        </span>
      </button>
      <button aria-label={t("moveUp")} className={miniBtn} disabled={index >= stack.length - 1} onClick={() => store.dispatch({ type: "reorderElement", id: element.id, toIndex: index + 1 })}>▲</button>
      <button aria-label={t("moveDown")} className={miniBtn} disabled={index <= 0} onClick={() => store.dispatch({ type: "reorderElement", id: element.id, toIndex: index - 1 })}>▼</button>
      <button aria-label={t("removeLayer")} className="px-1 text-[15px] leading-none text-faint hover:text-danger" onClick={() => store.dispatch({ type: "removeElement", id: element.id })}>×</button>
    </li>
  );
}

function ImageThumb({ assetId }: { assetId: string }) {
  const { assets } = useEditorState();
  const url = useAssetUrl(assets, assetId);
  return <span className="h-8 w-6 flex-none rounded border border-field bg-stage bg-cover bg-center" style={url ? { backgroundImage: `url(${url})` } : undefined} aria-hidden />;
}

// Capas de texto e imágenes con "+" y "×"; el orden recorre la pila completa de apilado.
export function LayersPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history } = useEditorState();
  const doc = history.present;
  const input = useRef<HTMLInputElement>(null);
  const texts = doc.elements.filter(isText).sort((a, b) => b.zIndex - a.zIndex);
  const images = doc.elements.filter(isImage).sort((a, b) => b.zIndex - a.zIndex);
  const dpi = new Map(dpiReport(doc).map((e) => [e.id, e]));

  const addText = () => {
    const id = store.newId();
    const ok = store.dispatch({
      type: "addElement",
      element: {
        id, type: "text", x: doc.canvas.widthIn / 4, y: doc.canvas.heightIn * 0.65,
        width: doc.canvas.widthIn / 2, height: 1, rotation: 0, zIndex: 0, visible: true,
        runs: [{ text: t("newText"), fontFamily: "Lora", fontSizePt: 36, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
        align: "center", lineHeight: 1.2, letterSpacing: 0.02,
        shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
      },
    });
    if (ok) store.select(id);
  };

  return (
    <>
      <Section title={t("layers")} action={<button aria-label={t("addText")} onClick={addText} className={plus}>+</button>}>
        {texts.length === 0 ? (
          <p className="text-xs text-muted">{t("noLayers")}</p>
        ) : (
          <ul className="flex flex-col gap-[5px]">
            {texts.map((l) => (
              <Row key={l.id} element={l} name={layerLabel(l)} sub={l.runs[0]?.fontFamily ?? ""}
                thumb={<span className="flex-none text-[15px] leading-none" style={{ fontFamily: l.runs[0]?.fontFamily }}>Aa</span>} />
            ))}
          </ul>
        )}
      </Section>
      <Section
        title={t("images")} last
        action={
          <>
            <button aria-label={t("addImage")} onClick={() => input.current?.click()} className={plus}>+</button>
            <input
              ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden data-testid="layer-image-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importImage(store, f, "layer");
              }}
            />
          </>
        }
      >
        {images.length === 0 ? (
          <p className="text-xs text-muted">{t("bgNone")}</p>
        ) : (
          <ul className="flex flex-col gap-[5px]">
            {images.map((l) => {
              const a = doc.assets.find((x) => x.id === l.assetRef.assetId);
              const d = dpi.get(l.id);
              const name = typeof a?.metadata.name === "string" ? a.metadata.name : t("imageLayer");
              return (
                <Row key={l.id} element={l} name={name} sub={`${a?.metadata.widthPx ?? "?"}×${a?.metadata.heightPx ?? "?"} px`}
                  dpiLow={d?.lowDpi ? t("dpiEffective", { dpi: Math.round(d.dpi) }) : undefined}
                  thumb={<ImageThumb assetId={l.assetRef.assetId} />} />
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
