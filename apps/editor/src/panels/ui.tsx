import { useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { useEditorState } from "../store/react";

export const sectionTitle = "mb-2.5 text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted";
export const chipBtn =
  "rounded-[7px] border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink enabled:hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-accent aria-pressed:bg-chip";
export const fieldCls = "w-full rounded-[7px] border border-field bg-white px-[9px] py-[7px] font-mono text-[12.5px] text-ink";

export function Section({ title, action, children, last }: { title: string; action?: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <section className={`p-4 ${last ? "" : "border-b border-line-soft"}`}>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Campo numérico con etiqueta asociada; confirma al salir del campo o con Enter (no en cada tecla).
export function NumberField({
  label, value, onCommit, min, max, step = "any", digits = 3,
}: { label: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number | "any"; digits?: number }) {
  const id = useId();
  const shown = String(Number(value.toFixed(digits)));
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(v) && v !== Number(shown)) onCommit(v);
  };
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-[10px] text-muted">{label}</label>
      <input
        id={id} type="number" className={fieldCls} min={min} max={max} step={step}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    </div>
  );
}

// Deslizador con etiqueta y valor visibles. Durante el arrastre solo cambia el valor mostrado y se
// confirma al soltar (un único paso de historial); con teclado confirma en cada cambio.
export function Slider({
  label, value, min, max, step, onCommit, format = (v) => String(v), testId,
}: { label: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void; format?: (v: number) => string; testId?: string }) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);
  const shown = draft ?? value;
  const finish = () => {
    dragging.current = false;
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex justify-between text-[11px] text-subtle">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono text-muted">{format(shown)}</span>
      </div>
      <input
        id={id} type="range" className="w-full accent-accent" min={min} max={max} step={step} value={shown} data-testid={testId}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={finish}
        onPointerCancel={finish}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (dragging.current) setDraft(v);
          else if (v !== value) onCommit(v);
        }}
      />
    </div>
  );
}

// Interruptor accesible del mockup (sombra, contorno).
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[13px] text-ink">{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[38px] rounded-full transition-colors ${checked ? "bg-accent" : "bg-switch-off"}`}
      >
        <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-[left] ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

// Botón de conmutación (negrita, cursiva, alineación...).
export const toggleBtn =
  "flex h-8 w-[34px] items-center justify-center rounded-[7px] border border-line-chip bg-white text-[13px] text-chip-ink enabled:hover:bg-chip aria-pressed:border-accent aria-pressed:bg-chip-on aria-pressed:text-accent-dark";

// Con una variante activa, Lienzo y Capas siguen actuando sobre el diseño base: se avisa.
export function BaseDesignNotice() {
  const { t } = useI18n();
  const { activeVariantId } = useEditorState();
  if (!activeVariantId) return null;
  return <p role="note" data-testid="base-design-notice" className="mb-3 rounded-lg border border-warn-line bg-warn-bg px-2.5 py-2 text-[11.5px] leading-snug text-warn-ink">{t("variantBaseNotice")}</p>;
}
