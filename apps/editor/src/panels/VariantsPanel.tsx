import { useState } from "react";
import {
  DIGITAL_PRESETS, MAX_TARGET_PX, customTarget, elementVisibility, isResolvedTarget, overridesOf, targetFromPreset, visibleArea,
  type Element, type ResolvedTarget,
} from "@free-book-cover/core";
import { browserMeasure, textHeightIn } from "../canvas/measure";
import { useI18n } from "../i18n";
import { useDisplayDoc, useEditorState, useStore } from "../store/react";
import { gcdRatio, presetLabel, targetLabel } from "./variantLabels";
import { chipBtn, fieldCls, NumberField, Section } from "./ui";

const CUSTOM = "custom";
const layerName = (e: Element, imageName: string): string =>
  e.type === "text" ? e.runs.map((r) => r.text).join("").slice(0, 24) || "—" : e.type === "image" ? imageName : "—";

// Variantes digitales (SDD R-08): destinos derivados del diseño base con ajustes propios. Independiente del contenedor.
export function VariantsPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, activeVariantId } = useEditorState();
  const base = history.present;
  const targets = (base.digitalTargets ?? []).filter(isResolvedTarget);
  const active = targets.find((x) => x.id === activeVariantId) ?? null;
  const [choice, setChoice] = useState(DIGITAL_PRESETS[0]!.id);
  const [cw, setCw] = useState("1080");
  const [ch, setCh] = useState("1080");
  const [invalid, setInvalid] = useState(false);

  const add = () => {
    const id = store.newId();
    let target: ResolvedTarget;
    if (choice === CUSTOM) {
      const r = customTarget(id, Number(cw), Number(ch));
      setInvalid(!r.ok);
      if (!r.ok) return;
      target = r.target;
    } else {
      setInvalid(false);
      target = targetFromPreset(DIGITAL_PRESETS.find((p) => p.id === choice)!, id);
    }
    if (store.dispatch({ type: "addDigitalTarget", target })) store.setActiveVariant(id);
  };

  const groups = ["instagram", "facebook"] as const;
  return (
    <Section title={t("variantsTitle")}>
      <p className="mb-2.5 text-[10.5px] leading-snug text-muted">{t("variantsHint")}</p>
      <ul className="mb-3 space-y-1.5" aria-label={t("variantsList")}>
        <li>
          <button className={`${chipBtn} w-full text-left`} aria-pressed={active === null} onClick={() => store.setActiveVariant(null)}>
            {t("variantsBase")}
          </button>
        </li>
        {targets.map((x) => (
          <li key={x.id} className="flex items-center gap-1.5">
            <button className={`${chipBtn} min-w-0 flex-1 text-left`} aria-pressed={active?.id === x.id} onClick={() => store.setActiveVariant(x.id)}>
              <span className="block truncate font-semibold">{targetLabel(t, x)}</span>
              <span className="block font-mono text-[9.5px] opacity-70">{x.widthPx}×{x.heightPx} · {gcdRatio(x.widthPx, x.heightPx)} · v{x.presetVersion}</span>
            </button>
            <button aria-label={t("variantRemove", { name: targetLabel(t, x) })} className="px-1 text-[15px] leading-none text-faint hover:text-danger" onClick={() => store.dispatch({ type: "removeDigitalTarget", id: x.id })}>×</button>
          </li>
        ))}
      </ul>

      <label htmlFor="variant-preset" className="mb-1 block text-[10px] text-muted">{t("variantDestination")}</label>
      <select id="variant-preset" className={fieldCls} value={choice} onChange={(e) => setChoice(e.target.value)}>
        {groups.map((g) => (
          <optgroup key={g} label={t(g === "instagram" ? "platformInstagram" : "platformFacebook")}>
            {DIGITAL_PRESETS.filter((p) => p.platform === g).map((p) => (
              <option key={p.id} value={p.id}>{presetLabel(t, p.id)} ({p.widthPx}×{p.heightPx})</option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>{t("customTarget")}</option>
      </select>
      {choice === CUSTOM && (
        <div className="mt-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="variant-w" className="mb-1 block text-[10px] text-muted">{t("widthLabel")} (px)</label>
            <input id="variant-w" className={fieldCls} type="number" min="1" max={MAX_TARGET_PX} value={cw} onChange={(e) => setCw(e.target.value)} />
          </div>
          <span className="pb-2 text-faint" aria-hidden>×</span>
          <div className="min-w-0 flex-1">
            <label htmlFor="variant-h" className="mb-1 block text-[10px] text-muted">{t("heightLabel")} (px)</label>
            <input id="variant-h" className={fieldCls} type="number" min="1" max={MAX_TARGET_PX} value={ch} onChange={(e) => setCh(e.target.value)} />
          </div>
        </div>
      )}
      {invalid && <p role="alert" className="mt-1.5 text-[11px] text-danger">{t("variantSizeInvalid", { max: MAX_TARGET_PX })}</p>}
      <button className={`${chipBtn} mt-2 w-full`} onClick={add}>{t("variantAdd")}</button>

      {active && <ActiveVariant target={active} />}
      {!active && targets.length === 0 && <p className="mt-2 text-[10.5px] text-muted">{t("variantsNone")}</p>}
    </Section>
  );
}

function ActiveVariant({ target }: { target: ResolvedTarget }) {
  const { t } = useI18n();
  const store = useStore();
  const { history, selectedId } = useEditorState();
  const display = useDisplayDoc();
  const base = history.present;
  const area = visibleArea(base, target);
  const ov = overridesOf(target);
  const outside = elementVisibility(display).filter((v) => v.visibility !== "inside");
  const sel = display.elements.find((e) => e.id === selectedId);
  const selOv = sel ? ov.elements?.[sel.id] : undefined;
  const hasOverrides = Boolean(ov.background) || Object.keys(ov.elements ?? {}).length > 0;

  const setFontScale = (pct: number) => {
    if (!sel || sel.type !== "text" || !(pct > 0)) return;
    const next = pct / 100;
    const prev = selOv?.fontScale ?? 1;
    const m = browserMeasure();
    const height = m ? textHeightIn({ ...sel, runs: sel.runs.map((r) => ({ ...r, fontSizePt: (r.fontSizePt * next) / prev })) }, m) : undefined;
    store.dispatch({ type: "setVariantElement", targetId: target.id, elementId: sel.id, props: { fontScale: next, ...(height !== undefined ? { height } : {}) } });
  };

  return (
    <div className="mt-3 border-t border-line-soft pt-3" data-testid="variant-details">
      <div className="text-[11px] font-semibold">{t("variantEditing", { name: targetLabel(t, target) })}</div>
      <p className="mt-1 text-[10.5px] leading-snug text-muted">{t("variantScopeHint")}</p>
      <p className="mt-1.5 font-mono text-[11px] text-subtle" data-testid="variant-area">
        {t("variantVisibleArea", { pct: Math.round(area.coverage * 100) })}
      </p>
      {outside.length > 0 && (
        <ul className="mt-1.5 space-y-0.5" aria-label={t("variantOutsideTitle")}>
          {outside.map((o) => {
            const e = display.elements.find((x) => x.id === o.id)!;
            return (
              <li key={o.id} role="status" data-testid="variant-outside" className="text-[10.5px] text-warn-ink">
                {t(o.visibility === "outside" ? "variantOutside" : "variantPartial", { name: layerName(e, t("imageLayer")) })}
              </li>
            );
          })}
        </ul>
      )}
      {sel && (
        <div className="mt-2.5 space-y-1.5">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox" checked={sel.visible}
              onChange={(e) => store.dispatch({ type: "setVariantElement", targetId: target.id, elementId: sel.id, props: { visible: e.target.checked } })}
            />
            {t("variantElementVisible")}
          </label>
          {sel.type === "text" && (
            <NumberField label={t("variantFontScale")} value={(selOv?.fontScale ?? 1) * 100} min={10} max={1000} digits={0} onCommit={setFontScale} />
          )}
          <button className={chipBtn} disabled={!selOv} onClick={() => store.dispatch({ type: "resetVariantElement", targetId: target.id, elementId: sel.id })}>
            {t("variantResetElement")}
          </button>
        </div>
      )}
      <button className={`${chipBtn} mt-2`} disabled={!hasOverrides} onClick={() => store.dispatch({ type: "resetVariant", targetId: target.id })}>
        {t("variantReset")}
      </button>
    </div>
  );
}
