import { useId, useState, type ReactNode } from "react";

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
