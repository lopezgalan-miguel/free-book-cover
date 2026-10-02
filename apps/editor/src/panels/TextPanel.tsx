import { useLayoutEffect, useRef, useState } from "react";
import {
  FONT_CATALOG, applyStyleToRange, documentFontFamilies, fontStack, rangeStyle, replaceText, runsToText,
  type FontGroupId, type RunStylePatch, type TextElement,
} from "@free-book-cover/core";
import { browserMeasure, textHeightIn } from "../canvas/measure";
import { useAssetUrl } from "../canvas/useImageSources";
import { useFontVersion, useFonts } from "../fonts/fontContext";
import { importFont } from "../fonts/importFont";
import { importImage } from "../images/importImage";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";
import type { TextSection } from "../layout/mobileTabs";
import { Section, Slider, Switch, fieldCls, toggleBtn } from "./ui";

const ALL_SECTIONS: readonly TextSection[] = ["text", "font", "style", "color", "fx"];

const GROUP_KEY: Record<FontGroupId, DictKey> = { serif: "fontGroupSerif", sans: "fontGroupSans", display: "fontGroupDisplay", system: "fontGroupSystem" };
const WEIGHTS = [
  [300, "weight300"], [400, "weight400"], [500, "weight500"], [600, "weight600"], [700, "weight700"], [800, "weight800"],
] as const satisfies ReadonlyArray<readonly [number, DictKey]>;
const SWATCHES = ["#FFFFFF", "#F4EFE6", "#C2B6A1", "#8C6F47", "#2B2824", "#1A1712", "#B4453A", "#3E5C4B"];
const HEX = /^[0-9a-fA-F]{6}$/;
const uploadBtn = "cursor-pointer text-[11px] font-medium text-accent-dark hover:text-ink";

// Panel de tipografía del elemento de texto seleccionado. Independiente del contenedor: solo usa el almacén.
// `sections` permite que el contenedor móvil muestre una parte por pestaña con los mismos controles.
export function TextPanel({ sections = ALL_SECTIONS }: { sections?: readonly TextSection[] }) {
  const { history, selectedId } = useEditorState();
  const el = history.present.elements.find((e) => e.id === selectedId);
  // key: la selección del textarea pertenece al bloque; al cambiar de bloque se reinicia.
  return el?.type === "text" ? <TextEditor key={el.id} id={el.id} sections={sections} /> : null;
}

function TextEditor({ id, sections }: { id: string; sections: readonly TextSection[] }) {
  const show = (s: TextSection) => sections.includes(s);
  const { t } = useI18n();
  const store = useStore();
  const registry = useFonts();
  useFontVersion();
  const { history, assets } = useEditorState();
  const doc = history.present;
  const el = doc.elements.find((e): e is TextElement => e.id === id && e.type === "text")!;
  const area = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const latest = () => store.getState().history.present.elements.find((e): e is TextElement => e.id === id && e.type === "text");
  // Un solo comando por cambio; el alto sigue al contenido cuando se puede medir.
  const commit = (props: Partial<Omit<TextElement, "id" | "type" | "zIndex">>) => {
    const cur = latest();
    if (!cur) return;
    const measure = browserMeasure();
    const next = { ...cur, ...props };
    store.dispatch({ type: "updateElement", id, props: measure ? { ...props, height: textHeightIn(next, measure) } : props });
  };
  const range = () => ({ start: area.current?.selectionStart ?? sel.start, end: area.current?.selectionEnd ?? sel.end });
  const style = (patch: RunStylePatch) => {
    const cur = latest();
    if (!cur) return;
    const r = range();
    commit({ runs: applyStyleToRange(cur.runs, r.start, r.end, patch) });
  };

  const text = runsToText(el.runs);
  // Textarea no controlado: el valor se vuelca por propiedad solo si difiere (deshacer, cambios externos),
  // lo que conserva el cursor y la selección mientras se escribe.
  useLayoutEffect(() => {
    if (area.current && area.current.value !== text) area.current.value = text;
  }, [text]);
  const cur = rangeStyle(el.runs, sel.start, sel.end);
  const first = el.runs[0];
  const selected = Math.abs(sel.end - sel.start);
  const family = cur.fontFamily;
  const weight = cur.weight;
  const color = (cur.color ?? first?.color ?? "#ffffff").toLowerCase();
  const uploads = [...documentFontFamilies(doc)];

  const pickFont = (name: string) => {
    registry.ensureCatalog(name, weight ?? first?.weight ?? 400, cur.italic ?? false);
    style({ fontFamily: name });
  };
  const fontMark = (name: string) => {
    const s = registry.stateOf(name);
    if (s === "failed") return <span className="text-[10px] text-danger">{t("fontFailed")}</span>;
    if (s === "loading") return <span className="text-[10px] text-muted">{t("fontLoading")}</span>;
    return family === name ? <span className="text-xs text-accent-dark">✓</span> : null;
  };
  const fontBtn = (name: string) => (
    <li key={name}>
      <button
        type="button" aria-pressed={family === name} onClick={() => pickFont(name)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-[7px] text-left hover:bg-chip aria-pressed:bg-chip"
      >
        <span className="truncate text-base leading-none text-ink" style={{ fontFamily: fontStack(name) }}>{name}</span>
        {fontMark(name)}
      </button>
    </li>
  );

  return (
    <div aria-label={t("text")} role="group">
      {show("text") && <Section title={t("text")}>
        <textarea
          ref={area} rows={2} className={`${fieldCls} font-sans text-sm leading-snug`} aria-label={t("textContent")} placeholder={t("textPh")}
          onChange={(e) => {
            const cur = latest();
            if (cur) commit({ runs: replaceText(cur.runs, e.target.value) });
            setSel({ start: e.target.selectionStart, end: e.target.selectionEnd });
          }}
          onSelect={(e) => setSel({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
        />
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted" data-testid="style-scope">
          {t("applyTo", { scope: selected > 0 ? t("scopeSelection", { n: selected }) : t("scopeAll") })}
        </p>
      </Section>}

      {show("font") && <Section
        title={t("font")}
        action={
          <>
            <label className={uploadBtn}>
              {t("upload")}
              <input
                type="file" accept=".ttf,.otf,.woff2" className="sr-only" aria-label={t("uploadFont")}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const r = await importFont(store, registry, f);
                  if (r.ok) style({ fontFamily: r.family });
                }}
              />
            </label>
          </>
        }
      >
        <div className="max-h-[186px] overflow-y-auto rounded-[9px] border border-line-soft bg-white p-[5px]" role="group" aria-label={t("fontList")}>
          {uploads.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-[7px] text-[9.5px] uppercase tracking-[.1em] text-faint">{t("fontGroupUploads")}</div>
              <ul>{uploads.map(fontBtn)}</ul>
            </>
          )}
          {FONT_CATALOG.map((g) => (
            <div key={g.id}>
              <div className="px-2 pb-1 pt-[7px] text-[9.5px] uppercase tracking-[.1em] text-faint">{t(GROUP_KEY[g.id])}</div>
              <ul>{g.names.map(fontBtn)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted">{t("fontUploadHint")}</p>
      </Section>}

      {show("style") && <Section title={t("style")}>
        <div className="mb-3 flex gap-2">
          <select
            aria-label={t("fontWeight")} className={`${fieldCls} flex-1 font-sans`} value={weight ?? ""}
            onChange={(e) => style({ weight: Number(e.target.value) })}
          >
            {weight === undefined && <option value="" disabled>{t("mixed")}</option>}
            {WEIGHTS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
          </select>
        </div>
        <div className="mb-3.5 flex gap-1.5">
          <button type="button" aria-label={t("bold")} aria-pressed={(weight ?? 0) >= 700} className={toggleBtn} onClick={() => style({ weight: (weight ?? 400) >= 700 ? 400 : 700 })}><b>B</b></button>
          <button type="button" aria-label={t("italic")} aria-pressed={cur.italic === true} className={toggleBtn} onClick={() => style({ italic: !cur.italic })}><i className="font-serif">I</i></button>
          <button type="button" aria-label={t("underline")} aria-pressed={cur.underline === true} className={toggleBtn} onClick={() => style({ underline: !cur.underline })}><u>U</u></button>
          <button type="button" aria-label={t("uppercase")} aria-pressed={cur.uppercase === true} className={toggleBtn} onClick={() => style({ uppercase: !cur.uppercase })}><span className="text-[11px]">AA</span></button>
          <span className="flex-1" />
          {(["left", "center", "right", "justify"] as const).map((a) => (
            <button
              key={a} type="button" aria-pressed={el.align === a} className={toggleBtn}
              aria-label={t(a === "left" ? "alignLeft" : a === "center" ? "alignCenter" : a === "right" ? "alignRight" : "alignJustify")}
              onClick={() => commit({ align: a })}
            >
              {a === "left" ? "⇤" : a === "center" ? "⇔" : a === "right" ? "⇥" : "☰"}
            </button>
          ))}
        </div>
        <Slider label={t("size")} min={6} max={300} step={1} value={cur.fontSizePt ?? first?.fontSizePt ?? 24} format={(v) => `${v} pt`} onCommit={(v) => style({ fontSizePt: v })} />
        <Slider label={t("lineH")} min={0.8} max={2.4} step={0.05} value={el.lineHeight} format={(v) => v.toFixed(2)} onCommit={(lineHeight) => commit({ lineHeight })} />
        <Slider label={t("letterS")} min={-0.05} max={0.5} step={0.01} value={el.letterSpacing} format={(v) => `${v.toFixed(2)}em`} onCommit={(letterSpacing) => commit({ letterSpacing })} />
      </Section>}

      {show("color") && <Section title={t("color")}>
        <div className="mb-[11px] flex items-center gap-2.5">
          <input
            type="color" aria-label={t("colorPicker")} value={color} onChange={(e) => style({ color: e.target.value })}
            className="h-[38px] w-11 cursor-pointer rounded-lg border border-field bg-white p-[3px]"
          />
          <div className="flex flex-1 items-center rounded-lg border border-field bg-white px-2.5">
            <span className="font-mono text-[13px] text-faint">#</span>
            <input
              type="text" aria-label={t("hexColor")} maxLength={7}
              className="min-w-0 flex-1 bg-transparent px-1.5 py-[9px] font-mono text-[13px] uppercase text-ink outline-none"
              value={hexDraft ?? color.slice(1).toUpperCase()}
              onChange={(e) => {
                const v = e.target.value.replace("#", "");
                setHexDraft(v);
                if (HEX.test(v)) style({ color: `#${v.toLowerCase()}` });
              }}
              onBlur={() => setHexDraft(null)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((hex) => (
            <button
              key={hex} type="button" aria-label={t("swatch", { hex })} title={hex} onClick={() => style({ color: hex.toLowerCase() })}
              className="h-6 min-w-6 flex-1 cursor-pointer rounded-[5px] border border-black/10" style={{ background: hex }}
            />
          ))}
        </div>
      </Section>}

      {show("fx") && <Section title={t("fx")} last>
        <Switch label={t("shadow")} checked={el.shadow.on} onChange={(on) => commit({ shadow: { ...el.shadow, on } })} />
        {el.shadow.on && (
          <Slider label={t("shadowIntensity")} min={0} max={100} step={1} value={el.shadow.intensity} onCommit={(intensity) => commit({ shadow: { ...el.shadow, intensity } })} />
        )}
        <Switch label={t("outline")} checked={el.outline.on} onChange={(on) => commit({ outline: { ...el.outline, on } })} />
        {el.outline.on && (
          <div className="mb-3.5 flex items-end gap-2.5">
            <div className="min-w-0 flex-1">
              <Slider label={t("outlineWidth")} min={1} max={14} step={0.5} value={el.outline.width} onCommit={(width) => commit({ outline: { ...el.outline, width } })} />
            </div>
            <input
              type="color" aria-label={t("outlineColor")} value={el.outline.color}
              onChange={(e) => commit({ outline: { ...el.outline, color: e.target.value } })}
              className="mb-3 h-[30px] w-9 cursor-pointer rounded-[7px] border border-field bg-white p-0.5"
            />
          </div>
        )}
        <div className="mb-2 mt-1 flex items-center justify-between">
          <span className="text-[13px] text-ink">{t("texture")}</span>
          {el.texture && (
            <button type="button" className="text-[11.5px] text-muted hover:text-danger" onClick={() => commit({ texture: undefined })}>{t("remove")}</button>
          )}
        </div>
        <label className="mb-4 flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-dashed border-dash bg-card px-[11px] py-[9px] hover:border-faint hover:bg-white">
          <TextureThumb assetId={el.texture?.assetId ?? null} assets={assets} />
          <span className="text-[12.5px] font-medium text-ink">{t("textureAdd")}</span>
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={t("textureAdd")}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const r = await importImage(store, f, "asset");
              if (r.ok) commit({ texture: { assetId: r.assetId } });
            }}
          />
        </label>
        <Slider label={t("curve")} min={-100} max={100} step={1} value={el.curvature} testId="curve-slider" onCommit={(curvature) => commit({ curvature })} />
      </Section>}
    </div>
  );
}

function TextureThumb({ assetId, assets }: { assetId: string | null; assets: Parameters<typeof useAssetUrl>[0] }) {
  const url = useAssetUrl(assets, assetId);
  return <span aria-hidden className="h-[34px] w-[34px] flex-none rounded-md border border-field bg-chip bg-cover bg-center" style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}

