import { useEffect, useId, useState } from "react";
import { CANVAS_PRESETS, DEFAULT_PX_PER_IN, MAX_CANVAS_IN, convert, presetSizeIn, type ResizePolicy, type Unit } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";
import { BaseDesignNotice, chipBtn, fieldCls, Section } from "./ui";

const UNITS: Unit[] = ["px", "mm", "in"];
const POLICIES: Array<{ id: ResizePolicy; label: DictKey; hint: DictKey }> = [
  { id: "crop", label: "policyCrop", hint: "policyCropHint" },
  { id: "fit", label: "policyFit", hint: "policyFitHint" },
  { id: "stretch", label: "policyStretch", hint: "policyStretchHint" },
];
const DIGITS: Record<Unit, number> = { px: 0, mm: 1, in: 3, pt: 1 };
const show = (inches: number, unit: Unit) => String(Number(convert(inches, "in", unit, DEFAULT_PX_PER_IN).toFixed(DIGITS[unit])));

// Lienzo: preajustes y tamaño libre en px/mm/in con política explícita de redimensión (SDD R-02).
export function CanvasPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, selectedId } = useEditorState();
  const doc = history.present;
  const [unit, setUnit] = useState<Unit>("px");
  const [policy, setPolicy] = useState<ResizePolicy>("crop");
  const [onBackground, setOnBackground] = useState(true);
  const [onSelected, setOnSelected] = useState(true);
  const [w, setW] = useState(show(doc.canvas.widthIn, unit));
  const [h, setH] = useState(show(doc.canvas.heightIn, unit));
  const [invalid, setInvalid] = useState(false);
  const uid = useId();

  // El borrador sigue al documento (deshacer, preajustes) y a la unidad.
  useEffect(() => {
    setW(show(doc.canvas.widthIn, unit));
    setH(show(doc.canvas.heightIn, unit));
    setInvalid(false);
  }, [doc.canvas.widthIn, doc.canvas.heightIn, unit]);

  const selected = doc.elements.find((e) => e.id === selectedId);
  const selectedImage = selected?.type === "image" ? selected : undefined;
  const hasBgImage = typeof doc.canvas.background === "object";

  const resize = (widthIn: number, heightIn: number) => {
    store.dispatch({
      type: "resizeCanvas", widthIn, heightIn, policy,
      targets: { background: onBackground && hasBgImage, elementIds: onSelected && selectedImage ? [selectedImage.id] : [] },
    });
  };
  const apply = () => {
    const wv = convert(Number(w), unit, "in", DEFAULT_PX_PER_IN);
    const hv = convert(Number(h), unit, "in", DEFAULT_PX_PER_IN);
    const ok = [wv, hv].every((v) => Number.isFinite(v) && v > 0 && v <= MAX_CANVAS_IN) && w.trim() !== "" && h.trim() !== "";
    setInvalid(!ok);
    if (ok) resize(wv, hv);
  };

  const groups: Array<{ title: DictKey; group: "kdp" | "ratio" }> = [{ title: "kdp", group: "kdp" }, { title: "ratio", group: "ratio" }];
  return (
    <Section title={t("canvas")}>
      <BaseDesignNotice />
      {groups.map((g) => (
        <div key={g.group} className="mb-3">
          <div className="mb-[7px] text-[11px] text-muted">{t(g.title)}</div>
          <div className="flex flex-wrap gap-1.5">
            {CANVAS_PRESETS.filter((p) => p.group === g.group).map((p) => (
              <button key={p.id} className={`${chipBtn} flex flex-col items-start`} onClick={() => { const s = presetSizeIn(p); resize(s.widthIn, s.heightIn); }}>
                <span className="font-semibold">{p.label}</span>
                <span className="font-mono text-[9.5px] opacity-70">{p.sub}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <form className="mt-1" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}w`} className="mb-1 block text-[10px] text-muted">{t("widthLabel")} ({unit})</label>
            <input id={`${uid}w`} className={fieldCls} inputMode="decimal" type="number" step="any" min="0" value={w} onChange={(e) => setW(e.target.value)} />
          </div>
          <span className="pb-2 text-faint" aria-hidden>×</span>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}h`} className="mb-1 block text-[10px] text-muted">{t("heightLabel")} ({unit})</label>
            <input id={`${uid}h`} className={fieldCls} inputMode="decimal" type="number" step="any" min="0" value={h} onChange={(e) => setH(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <div>
            <label htmlFor={`${uid}u`} className="mb-1 block text-[10px] text-muted">{t("unitLabel")}</label>
            <select id={`${uid}u`} className={`${fieldCls} w-auto`} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button type="submit" className={`${chipBtn} flex-1`}>{t("applySize")}</button>
        </div>
        {invalid && <p role="alert" className="mt-1.5 text-[11px] text-danger">{t("sizeInvalid")}</p>}

        <fieldset className="mt-3">
          <legend className="mb-1.5 text-[11px] text-muted">{t("policyTitle")}</legend>
          <div className="flex gap-1.5">
            {POLICIES.map((p) => (
              <label key={p.id} className={`${chipBtn} flex-1 cursor-pointer text-center has-[:checked]:border-accent has-[:checked]:bg-chip has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent`}>
                <input type="radio" name={`${uid}p`} className="sr-only" checked={policy === p.id} onChange={() => setPolicy(p.id)} />
                {t(p.label)}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-muted">{t(POLICIES.find((p) => p.id === policy)!.hint)}</p>
        </fieldset>

        <fieldset className="mt-2">
          <legend className="mb-1 text-[11px] text-muted">{t("policyTarget")}</legend>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={onBackground} disabled={!hasBgImage} onChange={(e) => setOnBackground(e.target.checked)} />
            {t("targetBg")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={onSelected} disabled={!selectedImage} onChange={(e) => setOnSelected(e.target.checked)} />
            {t("targetSelected")}
          </label>
        </fieldset>
      </form>
    </Section>
  );
}
