import { dpiReport } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { NumberField, Section, fieldCls } from "./ui";

// Alternativa numérica y accesible a arrastrar: posición, tamaño, rotación (y recorte en imágenes).
export function GeometryPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, selectedId } = useEditorState();
  const doc = history.present;
  const el = doc.elements.find((e) => e.id === selectedId);
  if (!el) {
    return (
      <>
        <p className="text-xs leading-snug text-muted">{t("selectHint")}</p>
        <p className="mt-2 text-xs text-muted">{t("noSelection")}</p>
      </>
    );
  }
  const set = (props: Record<string, unknown>) => store.dispatch({ type: "updateElement", id: el.id, props } as never);
  const dpi = el.type === "image" ? dpiReport(doc).find((d) => d.id === el.id) : undefined;
  const pct = (v: number) => v * 100;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  return (
    // key: al cambiar de elemento o de revisión se descartan borradores obsoletos.
    <section key={`${el.id}:${doc.revision}`} aria-label={t("geometry")}>
      <h2 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted">{t("geometry")}</h2>
      <div className="flex gap-2">
        <NumberField label={t("posX")} value={el.x} step={0.01} onCommit={(x) => set({ x })} />
        <NumberField label={t("posY")} value={el.y} step={0.01} onCommit={(y) => set({ y })} />
      </div>
      <div className="mt-2 flex gap-2">
        <NumberField label={t("sizeW")} value={el.width} min={0} step={0.01} onCommit={(width) => width >= 0 && set({ width })} />
        <NumberField label={t("sizeH")} value={el.height} min={0} step={0.01} onCommit={(height) => height >= 0 && set({ height })} />
      </div>
      <div className="mt-2 flex gap-2">
        <NumberField label={t("rotation")} value={el.rotation} step={1} onCommit={(rotation) => set({ rotation })} />
      </div>
      {el.type === "image" && (
        <>
          <div className="mt-3 text-[11px] text-muted">{t("cropTitle")}</div>
          <div className="mt-1.5 flex gap-2">
            <NumberField label={t("cropX")} value={pct(el.crop.x)} min={0} max={99} digits={1} onCommit={(v) => { const x = clamp(v, 0, 99) / 100; set({ crop: { ...el.crop, x, width: Math.min(el.crop.width, 1 - x) } }); }} />
            <NumberField label={t("cropY")} value={pct(el.crop.y)} min={0} max={99} digits={1} onCommit={(v) => { const y = clamp(v, 0, 99) / 100; set({ crop: { ...el.crop, y, height: Math.min(el.crop.height, 1 - y) } }); }} />
          </div>
          <div className="mt-2 flex gap-2">
            <NumberField label={t("cropW")} value={pct(el.crop.width)} min={1} max={100} digits={1} onCommit={(v) => set({ crop: { ...el.crop, width: clamp(v, 1, pct(1 - el.crop.x)) / 100 } })} />
            <NumberField label={t("cropH")} value={pct(el.crop.height)} min={1} max={100} digits={1} onCommit={(v) => set({ crop: { ...el.crop, height: clamp(v, 1, pct(1 - el.crop.y)) / 100 } })} />
          </div>
          <label className="mt-3 block text-[10px] text-muted" htmlFor="fit-mode">{t("fitMode")}</label>
          <select id="fit-mode" className={`${fieldCls} mt-1`} value={el.fit} onChange={(e) => set({ fit: e.target.value })}>
            <option value="cover">{t("fitCover")}</option>
            <option value="contain">{t("fitContain")}</option>
            <option value="fill">{t("fitFill")}</option>
          </select>
          {dpi && (
            <p className={`mt-2 font-mono text-[11px] ${dpi.lowDpi ? "text-warn-ink" : "text-muted"}`}>{t("dpiEffective", { dpi: Math.round(dpi.dpi) })}</p>
          )}
        </>
      )}
    </section>
  );
}
