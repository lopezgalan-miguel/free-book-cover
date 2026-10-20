import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  FONT_CATALOG, TEXTURE_KINDS, applyStyleToRange, fitFontToWidth, availableFaces, availableWeights, documentFontFamilies, fontStack, hasFace, nearestFace, rangeStyle, replaceText, runsToText,
  type FontGroupId, type InnerShadow, TEXTURE_DEFAULTS, type TextureKind, type TextureOptions, type RunStylePatch, type TextElement, type TextMask, type TextTexture,
} from "@free-book-cover/core";
import { browserMeasure, textHeightIn } from "../canvas/measure";
import { useAssetUrl } from "../canvas/useImageSources";
import { useFontVersion, useFonts } from "../fonts/fontContext";
import { importFont } from "../fonts/importFont";
import { useFontAxes } from "../fonts/useFontAxes";
import { importImage } from "../images/importImage";
import { generateTextureAsset, generatorOptionsOf } from "../images/generateTexture";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";
import type { TextSection } from "../layout/mobileTabs";
import { NumberField, Section, Slider, Switch, chipBtn, fieldCls, toggleBtn } from "./ui";

const ALL_SECTIONS: readonly TextSection[] = ["text", "font", "style", "color", "fx"];

const GROUP_KEY: Record<FontGroupId, DictKey> = { serif: "fontGroupSerif", sans: "fontGroupSans", display: "fontGroupDisplay", system: "fontGroupSystem" };
const WEIGHTS = [
  [300, "weight300"], [400, "weight400"], [500, "weight500"], [600, "weight600"], [700, "weight700"], [800, "weight800"],
] as const satisfies ReadonlyArray<readonly [number, DictKey]>;
const SWATCHES = ["#FFFFFF", "#F4EFE6", "#C2B6A1", "#8C6F47", "#2B2824", "#1A1712", "#B4453A", "#3E5C4B"];
const HEX = /^[0-9a-fA-F]{6}$/;
const uploadBtn = "cursor-pointer text-[11px] font-medium text-accent-dark hover:text-ink";
const DEFAULT_INNER: InnerShadow = { on: true, color: "#000000", opacity: 0.6, angle: 90, distance: 0.03, blur: 0.06 };
const MASK_DEFAULTS = { mode: "dark", threshold: 0.35, softness: 0.1 } as const;
const colorInput = "mb-3 h-[30px] w-9 flex-none cursor-pointer rounded-[7px] border border-field bg-white p-0.5";
// La máscara está enlazada a la textura si recorta con la misma imagen: entonces sigue su encaje.
const isLinked = (e: Pick<TextElement, "texture" | "mask"> | undefined) => !!e?.mask && !!e.texture && e.mask.assetId === e.texture.assetId;

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
  // Una entrada por textura distinta (recurso + encaje) de las demás capas de texto.
  const reusable = doc.elements
    .filter((e): e is TextElement & { texture: TextTexture } => e.type === "text" && e.id !== id && !!e.texture)
    .map((e) => ({ key: JSON.stringify(e.texture), texture: e.texture, name: e.runs.map((r) => r.text).join("").slice(0, 40) || "—" }))
    .filter((r, i, all) => all.findIndex((x) => x.key === r.key) === i);
  // Un solo comando por cambio; el alto sigue al contenido cuando se puede medir.
  // mergeKey: los cambios continuos de un mismo gesto (teclas, selector de color) son un solo paso de deshacer.
  const commit = (props: Partial<Omit<TextElement, "id" | "type" | "zIndex">>, mergeKey?: string) => {
    const cur = latest();
    if (!cur) return;
    const measure = browserMeasure();
    const next = { ...cur, ...props };
    store.dispatch({ type: "updateElement", id, props: measure ? { ...props, height: textHeightIn(next, measure) } : props }, mergeKey ? { mergeKey: `${id}:${mergeKey}` } : {});
  };
  // Escala todos los cuerpos para que la línea más ancha llene la caja (no en texto curvo).
  const fitWidth = () => {
    const cur = latest();
    const measure = browserMeasure();
    const runs = cur && measure ? fitFontToWidth(cur, measure) : null;
    if (runs) commit({ runs });
  };
  // Cambia la textura y, si la máscara está enlazada, le copia el mismo encaje en el mismo paso.
  const setTexture = (texture: TextTexture) => {
    const cur = latest();
    const m = cur?.mask;
    commit(isLinked(cur) && m ? { texture, mask: { ...texture, mode: m.mode, threshold: m.threshold, ...(m.softness !== undefined ? { softness: m.softness } : {}) } } : { texture });
  };
  const range = () => ({ start: area.current?.selectionStart ?? sel.start, end: area.current?.selectionEnd ?? sel.end });
  const style = (patch: RunStylePatch, mergeKey?: string) => {
    const cur = latest();
    if (!cur) return;
    const r = range();
    commit({ runs: applyStyleToRange(cur.runs, r.start, r.end, patch) }, mergeKey);
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
  const own = documentFontFamilies(doc);
  const uploads = [...own];
  const italic = cur.italic;
  // Solo se ofrecen las caras que la familia realmente tiene; con varias familias mezcladas no se restringe.
  const known = family !== undefined && availableFaces(family, own) !== null;
  const weightOptions = known ? WEIGHTS.filter(([v]) => availableWeights(family, italic ?? false, own).includes(v)) : WEIGHTS;
  const faceOk = (w: number, it: boolean) => !known || hasFace(family, w, it, own);
  const canItalic = !known || (availableFaces(family, own) ?? []).some((f) => f.italic) || italic === true;
  const canBold = faceOk(700, italic ?? false) || (weight ?? 0) >= 700;
  // Fuente variable subida: grosor y anchura continuos dentro de sus ejes (el grosor, acotado a 100..900).
  const axes = useFontAxes(doc, assets, family);
  const wght = axes?.find((a) => a.tag === "wght");
  const wdth = axes?.find((a) => a.tag === "wdth");

  const pickFont = (name: string) => {
    // Si la familia nueva no tiene el peso o la cursiva actuales se pasa a la cara más próxima, a la vista.
    const w = weight ?? first?.weight ?? 400;
    const nf = nearestFace(name, w, italic ?? false, own);
    // La anchura (wdth) es de la fuente variable anterior: con otra familia se quita.
    const patch: RunStylePatch = { fontFamily: name, stretch: undefined };
    if (nf && weight !== undefined && nf.weight !== weight) patch.weight = nf.weight;
    if (nf && italic !== undefined && nf.italic !== italic) patch.italic = nf.italic;
    registry.ensureCatalog(name, patch.weight ?? w, patch.italic ?? italic ?? false);
    style(patch);
  };
  const toggleItalic = () => {
    if (italic) return style({ italic: false });
    const nf = family !== undefined ? nearestFace(family, weight ?? 400, true, own) : null;
    style(nf?.italic && weight !== undefined && nf.weight !== weight ? { italic: true, weight: nf.weight } : { italic: true });
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
            if (cur) commit({ runs: replaceText(cur.runs, e.target.value) }, "text");
            setSel({ start: e.target.selectionStart, end: e.target.selectionEnd });
          }}
          onSelect={(e) => setSel({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
          onBlur={() => store.endGesture()}
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
                type="file" accept=".ttf,.otf,.woff2,.ttc" className="sr-only" aria-label={t("uploadFont")}
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
        {wght && (
          <Slider
            label={t("fontWeightAxis")} min={Math.max(100, Math.ceil(wght.min))} max={Math.min(900, Math.floor(wght.max))} step={1}
            value={weight ?? Math.round(wght.def)} onCommit={(v) => style({ weight: v })}
          />
        )}
        {wdth && (
          <Slider
            label={t("fontWidthAxis")} min={Math.max(25, Math.ceil(wdth.min))} max={Math.min(200, Math.floor(wdth.max))} step={1}
            value={cur.stretch ?? Math.round(wdth.def)} format={(v) => `${v} %`}
            onCommit={(v) => style({ stretch: v === Math.round(wdth.def) ? undefined : v })}
          />
        )}
        <div className={`mb-3 flex gap-2 ${wght ? "hidden" : ""}`}>
          <select
            aria-label={t("fontWeight")} className={`${fieldCls} flex-1 font-sans`} value={weight ?? ""}
            onChange={(e) => style({ weight: Number(e.target.value) })}
          >
            {weight === undefined && <option value="" disabled>{t("mixed")}</option>}
            {weight !== undefined && !weightOptions.some(([v]) => v === weight) && (
              <option value={weight} disabled={!faceOk(weight, italic ?? false)}>
                {faceOk(weight, italic ?? false) ? String(weight) : t("weightUnavailable", { weight })}
              </option>
            )}
            {weightOptions.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
          </select>
        </div>
        <div className="mb-3.5 flex gap-1.5">
          <button type="button" aria-label={t("bold")} aria-pressed={(weight ?? 0) >= 700} disabled={!canBold} className={toggleBtn} onClick={() => style({ weight: (weight ?? 400) >= 700 ? 400 : 700 })}><b>B</b></button>
          <button type="button" aria-label={t("italic")} aria-pressed={cur.italic === true} disabled={!canItalic} className={toggleBtn} onClick={toggleItalic}><i className="font-serif">I</i></button>
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
        {/* El deslizador va de punto en punto; el campo admite décimas (10,5 pt). */}
        <div className="-mt-1 mb-3 flex">
          <NumberField label={t("sizeExact")} value={cur.fontSizePt ?? first?.fontSizePt ?? 24} min={1} max={1000} step={0.1} digits={1} onCommit={(v) => v > 0 && style({ fontSizePt: v })} />
        </div>
        <button type="button" className={`${chipBtn} -mt-1 mb-3`} disabled={el.curvature !== 0} onClick={fitWidth}>{t("fitWidth")}</button>
        <Slider label={t("lineH")} min={0.8} max={2.4} step={0.05} value={el.lineHeight} format={(v) => v.toFixed(2)} onCommit={(lineHeight) => commit({ lineHeight })} />
        <Slider label={t("letterS")} min={-0.05} max={0.5} step={0.01} value={el.letterSpacing} format={(v) => `${v.toFixed(2)}em`} onCommit={(letterSpacing) => commit({ letterSpacing })} />
        <Slider label={t("scaleX")} min={0.5} max={1.5} step={0.01} value={el.scaleX ?? 1} format={(v) => `${Math.round(v * 100)} %`} onCommit={(scaleX) => commit({ scaleX })} />
      </Section>}

      {show("color") && <Section title={t("color")}>
        <div className="mb-[11px] flex items-center gap-2.5">
          <input
            type="color" aria-label={t("colorPicker")} value={color} onChange={(e) => style({ color: e.target.value }, "color")} onBlur={() => store.endGesture()}
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
                if (HEX.test(v)) style({ color: `#${v.toLowerCase()}` }, "color");
              }}
              onBlur={() => { setHexDraft(null); store.endGesture(); }}
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
          <>
            <Slider label={t("shadowIntensity")} min={0} max={100} step={1} value={el.shadow.intensity} onCommit={(intensity) => commit({ shadow: { ...el.shadow, intensity } })} />
            <div className="flex items-end gap-2.5">
              <div className="min-w-0 flex-1">
                <Slider label={t("shadowOpacity")} min={0} max={100} step={1} value={Math.round((el.shadow.opacity ?? 0.6) * 100)} format={(v) => `${v} %`} onCommit={(v) => commit({ shadow: { ...el.shadow, opacity: v / 100 } })} />
              </div>
              <input
                type="color" aria-label={t("shadowColor")} value={el.shadow.color ?? "#000000"} className={colorInput}
                onChange={(e) => commit({ shadow: { ...el.shadow, color: e.target.value.toLowerCase() } }, "shadow-color")} onBlur={() => store.endGesture()}
              />
            </div>
            <Slider label={t("shadowAngle")} min={0} max={360} step={1} value={el.shadow.angle ?? 90} format={(v) => `${v}°`} onCommit={(angle) => commit({ shadow: { ...el.shadow, angle } })} />
            <Slider label={t("shadowDistance")} min={0} max={0.5} step={0.005} value={el.shadow.distance ?? 0.05} format={(v) => `${v.toFixed(3)} em`} onCommit={(distance) => commit({ shadow: { ...el.shadow, distance } })} />
          </>
        )}
        <Switch label={t("innerShadow")} checked={!!el.innerShadow?.on} onChange={(on) => commit({ innerShadow: on ? { ...(el.innerShadow ?? DEFAULT_INNER), on: true } : undefined })} />
        {el.innerShadow?.on && <InnerShadowControls value={el.innerShadow} onChange={(innerShadow, mk) => commit({ innerShadow }, mk)} onEnd={() => store.endGesture()} />}
        <Switch label={t("outline")} checked={el.outline.on} onChange={(on) => commit({ outline: { ...el.outline, on } })} />
        {el.outline.on && (
          <div className="mb-3.5 flex items-end gap-2.5">
            <div className="min-w-0 flex-1">
              <Slider label={t("outlineWidth")} min={1} max={14} step={0.5} value={el.outline.width} onCommit={(width) => commit({ outline: { ...el.outline, width } })} />
            </div>
            <input
              type="color" aria-label={t("outlineColor")} value={el.outline.color}
              onChange={(e) => commit({ outline: { ...el.outline, color: e.target.value } }, "outline-color")}
              onBlur={() => store.endGesture()}
              className="mb-3 h-[30px] w-9 cursor-pointer rounded-[7px] border border-field bg-white p-0.5"
            />
          </div>
        )}
        <div className="mb-2 mt-1 flex items-center justify-between">
          <span className="text-[13px] text-ink">{t("texture")}</span>
          {el.texture && (
            <button type="button" className="text-[11.5px] text-muted hover:text-danger" onClick={() => commit(isLinked(el) ? { texture: undefined, mask: undefined } : { texture: undefined })}>{t("remove")}</button>
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
              // Sustituir la imagen conserva el encaje elegido (y arrastra la máscara enlazada).
              if (r.ok) setTexture({ ...latest()?.texture, assetId: r.assetId });
            }}
          />
        </label>
        {/* Texturas que ya usan otras capas: se aplican con su encaje, sin volver a subir la imagen. */}
        {reusable.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t("textureReuse")}>
            {reusable.map((r) => (
              <button
                key={r.key} type="button" className={`${toggleBtn} w-auto gap-1.5 px-1.5`} aria-pressed={el.texture?.assetId === r.texture.assetId && JSON.stringify(el.texture) === JSON.stringify(r.texture)}
                aria-label={t("textureReuseFrom", { name: r.name })} title={t("textureReuseFrom", { name: r.name })}
                onClick={() => setTexture(r.texture)}
              >
                <TextureThumb assetId={r.texture.assetId} assets={assets} />
              </button>
            ))}
          </div>
        )}
        <GenerateTexture
          key={el.texture?.assetId ?? "none"}
          initial={generatorOptionsOf(doc.assets.find((a) => a.id === el.texture?.assetId))}
          onGenerate={async (opts) => {
            const r = await generateTextureAsset(store, opts);
            if (!r.ok) return;
            const texture: TextTexture = { assetId: r.assetId, fit: "tile", tileIn: 1.5 };
            // Mármol con huecos: la máscara por transparencia hace que la sombra también tenga las grietas.
            if (opts.kind === "cracked-marble" && opts.cracks === "holes") commit({ texture, mask: { ...texture, mode: "alpha", threshold: 0.5, softness: 0 } });
            // Grietas pintadas: la letra queda entera; una máscara enlazada anterior ya no tiene sentido.
            else if (opts.kind === "cracked-marble") commit({ texture, mask: undefined });
            else setTexture(texture);
          }}
        />
        {el.texture && <TextureFit texture={el.texture} onChange={setTexture} />}
        {el.texture && (
          <Switch
            label={t("maskOn")} checked={isLinked(el)}
            onChange={(on) => commit({ mask: on && el.texture ? { ...el.texture, ...MASK_DEFAULTS } : undefined })}
          />
        )}
        {el.mask && !isLinked(el) && (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] text-ink">{t("maskOwn")}</span>
            <button type="button" className="text-[11.5px] text-muted hover:text-danger" onClick={() => commit({ mask: undefined })}>{t("maskRemove")}</button>
          </div>
        )}
        {el.mask && <MaskControls mask={el.mask} onChange={(mask) => commit({ mask })} />}
        <label className={`${uploadBtn} mb-3 inline-block`}>
          {t("maskUpload")}
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={t("maskUpload")}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const r = await importImage(store, f, "asset");
              const m = latest()?.mask;
              if (r.ok) commit({ mask: { assetId: r.assetId, mode: m?.mode ?? MASK_DEFAULTS.mode, threshold: m?.threshold ?? MASK_DEFAULTS.threshold, softness: m?.softness ?? MASK_DEFAULTS.softness } });
            }}
          />
        </label>
        <p className="-mt-2 mb-3 text-[10.5px] leading-snug text-muted">{t("maskHint")}</p>
        <Slider label={t("curve")} min={-100} max={100} step={1} value={el.curvature} testId="curve-slider" onCommit={(curvature) => commit({ curvature })} />
      </Section>}
    </div>
  );
}

// Encaje de la textura: rellenar la caja o repetir una tesela de tamaño fijo, con desplazamiento.
function TextureFit({ texture, onChange }: { texture: TextTexture; onChange: (t: TextTexture) => void }) {
  const { t } = useI18n();
  const tile = texture.fit === "tile";
  const pos = texture.pos ?? (tile ? { x: 0, y: 0 } : { x: 0.5, y: 0.5 });
  return (
    <div className="mb-4">
      <div className="mb-2.5 flex gap-1.5" role="group" aria-label={t("textureFit")}>
        <button type="button" aria-pressed={!tile} className={`${toggleBtn} w-auto flex-1 px-2`} onClick={() => onChange({ ...texture, fit: "cover" })}>{t("fitCover")}</button>
        <button type="button" aria-pressed={tile} className={`${toggleBtn} w-auto flex-1 px-2`} onClick={() => onChange({ ...texture, fit: "tile", tileIn: texture.tileIn ?? 1 })}>{t("textureTile")}</button>
      </div>
      {tile && <Slider label={t("textureTileSize")} min={0.1} max={6} step={0.05} value={texture.tileIn ?? 1} format={(v) => `${v.toFixed(2)} in`} onCommit={(tileIn) => onChange({ ...texture, tileIn })} />}
      <Slider label={t("textureOffsetX")} min={0} max={1} step={0.01} value={pos.x} format={(v) => `${Math.round(v * 100)} %`} onCommit={(x) => onChange({ ...texture, pos: { ...pos, x } })} />
      <Slider label={t("textureOffsetY")} min={0} max={1} step={0.01} value={pos.y} format={(v) => `${Math.round(v * 100)} %`} onCommit={(y) => onChange({ ...texture, pos: { ...pos, y } })} />
    </div>
  );
}

const KIND_KEY: Record<TextureKind, DictKey> = { "cracked-marble": "textureKindMarble", stone: "textureKindStone", paper: "textureKindPaper" };

// Texturas incluidas: tipo y semilla (misma semilla, misma textura).
export function GenerateTexture({ onGenerate, initial }: { onGenerate: (o: TextureOptions) => Promise<void>; initial?: TextureOptions | null }) {
  const { t } = useI18n();
  const id = useId();
  const [kind, setKind] = useState<TextureKind>(initial?.kind ?? "cracked-marble");
  const [seed, setSeed] = useState(initial?.seed ?? 1);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(initial?.scale ?? TEXTURE_DEFAULTS[initial?.kind ?? "cracked-marble"].scale);
  const [color, setColor] = useState(initial?.color ?? TEXTURE_DEFAULTS[initial?.kind ?? "cracked-marble"].color);
  const [soften, setSoften] = useState(initial?.soften ?? 0);
  const changeKind = (k: TextureKind) => {
    setKind(k);
    setScale(TEXTURE_DEFAULTS[k].scale);
    setColor(TEXTURE_DEFAULTS[k].color);
  };
  const [cracks, setCracks] = useState<"holes" | "lines">(initial?.cracks ?? "holes");
  const [crackColor, setCrackColor] = useState(initial?.crackColor ?? "#a8222a");
  const crackId = useId();
  return (
    <div className="mb-4 rounded-[9px] border border-line-soft bg-card p-2.5" role="group" aria-label={t("textureGenerateTitle")}>
      <div className="mb-2 flex items-end gap-2">
        <div className="min-w-0 flex-[1.4]">
          <label htmlFor={id} className="mb-1 block text-[10px] text-muted">{t("textureKind")}</label>
          <select id={id} className={`${fieldCls} font-sans`} value={kind} onChange={(e) => changeKind(e.target.value as TextureKind)}>
            {TEXTURE_KINDS.map((k) => <option key={k} value={k}>{t(KIND_KEY[k])}</option>)}
          </select>
        </div>
        <NumberField label={t("textureSeed")} value={seed} min={0} step={1} digits={0} onCommit={(v) => setSeed(Math.max(0, Math.round(v)))} />
      </div>
      <div className="mb-2 flex items-end gap-2">
        <NumberField label={t("textureScale")} value={scale} min={1} max={32} step={1} digits={0} onCommit={(v) => setScale(Math.min(32, Math.max(1, Math.round(v))))} />
        <NumberField label={t("textureSoften")} value={soften} min={0} max={8} step={1} digits={0} onCommit={(v) => setSoften(Math.min(8, Math.max(0, Math.round(v))))} />
        <input
          type="color" aria-label={t("textureColor")} value={color} onChange={(e) => setColor(e.target.value.toLowerCase())}
          className="h-[34px] w-10 flex-none cursor-pointer rounded-lg border border-field bg-white p-[3px]"
        />
      </div>
      {kind === "cracked-marble" && (
        <div className="mb-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={crackId} className="mb-1 block text-[10px] text-muted">{t("textureCracks")}</label>
            <select id={crackId} className={`${fieldCls} font-sans`} value={cracks} onChange={(e) => setCracks(e.target.value as "holes" | "lines")}>
              <option value="holes">{t("textureCracksHoles")}</option>
              <option value="lines">{t("textureCracksLines")}</option>
            </select>
          </div>
          {cracks === "lines" && (
            <input
              type="color" aria-label={t("textureCrackColor")} value={crackColor} onChange={(e) => setCrackColor(e.target.value.toLowerCase())}
              className="h-[34px] w-10 flex-none cursor-pointer rounded-lg border border-field bg-white p-[3px]"
            />
          )}
        </div>
      )}
      <div className="flex gap-1.5">
        <button type="button" className={`${toggleBtn} w-auto px-2`} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>{t("textureSeedRandom")}</button>
        <button
          type="button" className={`${toggleBtn} w-auto flex-1 px-2`} disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = TEXTURE_DEFAULTS[kind];
              const extra: Partial<TextureOptions> = {
                ...(scale !== d.scale ? { scale } : {}),
                ...(color !== d.color ? { color } : {}),
                ...(soften > 0 ? { soften } : {}),
              };
              await onGenerate({ kind, seed, ...extra, ...(kind !== "cracked-marble" ? {} : cracks === "holes" ? { cracks } : { cracks, crackColor }) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("textureGenerating") : t("textureGenerate")}
        </button>
      </div>
    </div>
  );
}

function InnerShadowControls({ value, onChange, onEnd }: { value: InnerShadow; onChange: (v: InnerShadow, mergeKey?: string) => void; onEnd: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-end gap-2.5">
        <div className="min-w-0 flex-1">
          <Slider label={t("innerShadowOpacity")} min={0} max={100} step={1} value={Math.round(value.opacity * 100)} format={(v) => `${v} %`} onCommit={(v) => onChange({ ...value, opacity: v / 100 })} />
        </div>
        <input
          type="color" aria-label={t("innerShadowColor")} value={value.color} className={colorInput}
          onChange={(e) => onChange({ ...value, color: e.target.value.toLowerCase() }, "inner-color")} onBlur={onEnd}
        />
      </div>
      <Slider label={t("innerShadowAngle")} min={0} max={360} step={1} value={value.angle} format={(v) => `${v}°`} onCommit={(angle) => onChange({ ...value, angle })} />
      <Slider label={t("innerShadowDistance")} min={0} max={0.3} step={0.005} value={value.distance} format={(v) => `${v.toFixed(3)} em`} onCommit={(distance) => onChange({ ...value, distance })} />
      <Slider label={t("innerShadowBlur")} min={0} max={0.3} step={0.005} value={value.blur} format={(v) => `${v.toFixed(3)} em`} onCommit={(blur) => onChange({ ...value, blur })} />
    </>
  );
}

// Modo, umbral y suavizado de la máscara de recorte.
function MaskControls({ mask, onChange }: { mask: TextMask; onChange: (m: TextMask) => void }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="mb-2">
      <label className="mb-1.5 block text-[11px] text-subtle" htmlFor={id}>{t("maskMode")}</label>
      <select id={id} className={`${fieldCls} mb-3 font-sans`} value={mask.mode} onChange={(e) => onChange({ ...mask, mode: e.target.value as TextMask["mode"] })}>
        <option value="dark">{t("maskModeDark")}</option>
        <option value="light">{t("maskModeLight")}</option>
        <option value="alpha">{t("maskModeAlpha")}</option>
      </select>
      <Slider label={t("maskThreshold")} min={0} max={1} step={0.01} value={mask.threshold} format={(v) => `${Math.round(v * 100)} %`} onCommit={(threshold) => onChange({ ...mask, threshold })} />
      <Slider label={t("maskSoftness")} min={0} max={0.5} step={0.01} value={mask.softness ?? 0.1} format={(v) => `${Math.round(v * 100)} %`} onCommit={(softness) => onChange({ ...mask, softness })} />
    </div>
  );
}

function TextureThumb({ assetId, assets }: { assetId: string | null; assets: Parameters<typeof useAssetUrl>[0] }) {
  const url = useAssetUrl(assets, assetId);
  return <span aria-hidden className="h-[34px] w-[34px] flex-none rounded-md border border-field bg-chip bg-cover bg-center" style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}

