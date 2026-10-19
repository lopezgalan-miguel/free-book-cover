import type { ImageElement, ImageFilters } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { Section, Slider, chipBtn } from "./ui";

// Desenfoque, brillo y saturación (0..100, %, %); onChange recibe los filtros sin los valores neutros.
export function FilterSliders({ value, labels, onChange }: { value: ImageFilters | undefined; labels: { blur: string; brightness: string; saturation: string }; onChange: (f: ImageFilters | null) => void }) {
  const f = value ?? {};
  const set = (patch: ImageFilters) => {
    const next: ImageFilters = { ...f, ...patch };
    const clean: ImageFilters = {};
    if (next.blur) clean.blur = next.blur;
    if (next.brightness !== undefined && next.brightness !== 100) clean.brightness = next.brightness;
    if (next.saturation !== undefined && next.saturation !== 100) clean.saturation = next.saturation;
    onChange(Object.keys(clean).length ? clean : null);
  };
  return (
    <>
      <Slider label={labels.blur} min={0} max={100} step={1} value={f.blur ?? 0} onCommit={(blur) => set({ blur })} />
      <Slider label={labels.brightness} min={0} max={200} step={1} value={f.brightness ?? 100} format={(v) => `${v} %`} onCommit={(brightness) => set({ brightness })} />
      <Slider label={labels.saturation} min={0} max={200} step={1} value={f.saturation ?? 100} format={(v) => `${v} %`} onCommit={(saturation) => set({ saturation })} />
    </>
  );
}

// Imagen seleccionada: filtros. Independiente del contenedor: solo usa el almacén.
export function ImagePanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, selectedId } = useEditorState();
  const el = history.present.elements.find((e): e is ImageElement => e.id === selectedId && e.type === "image");
  if (!el) return null;
  const update = (filters: ImageFilters | null) => store.dispatch({ type: "updateElement", id: el.id, props: { filters: filters ?? undefined } });
  return (
    <Section title={t("imageTitle")}>
      <FilterSliders value={el.filters} labels={{ blur: t("imgBlur"), brightness: t("imgBrightness"), saturation: t("imgSaturation") }} onChange={update} />
      <button type="button" className={chipBtn} disabled={!el.filters} onClick={() => update(null)}>{t("imgFiltersReset")}</button>
    </Section>
  );
}
