import type { ShapeElement } from "@free-book-cover/core";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { ColorField, NumberField, Section, Switch } from "./ui";

const DEFAULT_STROKE = { color: "#000000", width: 0.02 };

// Forma seleccionada: relleno y borde. Independiente del contenedor: solo usa el almacén.
export function ShapePanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, selectedId } = useEditorState();
  const el = history.present.elements.find((e): e is ShapeElement => e.id === selectedId && e.type === "shape");
  if (!el) return null;
  const update = (props: Partial<Pick<ShapeElement, "fill" | "stroke">>, mergeKey?: string) =>
    store.dispatch({ type: "updateElement", id: el.id, props }, mergeKey ? { mergeKey: `${el.id}:${mergeKey}` } : {});
  return (
    <Section title={t("shapeTitle")}>
      <div className="mb-1.5 text-[11px] text-subtle">{t("shapeFill")}</div>
      <ColorField value={el.fill} pickerLabel={t("shapeFillPicker")} hexLabel={t("shapeFillHex")} onChange={(fill) => update({ fill }, "fill")} onEnd={() => store.endGesture()} />
      <div className="mt-3">
        <Switch label={t("shapeStroke")} checked={!!el.stroke} onChange={(on) => update({ stroke: on ? DEFAULT_STROKE : undefined })} />
      </div>
      {el.stroke && (
        <>
          <ColorField value={el.stroke.color} pickerLabel={t("shapeStrokePicker")} hexLabel={t("shapeStrokeHex")} onChange={(color) => update({ stroke: { ...el.stroke!, color } }, "stroke-color")} onEnd={() => store.endGesture()} />
          <div className="mt-2 flex">
            <NumberField label={t("shapeStrokeWidth")} value={el.stroke.width} min={0} step={0.01} onCommit={(width) => width >= 0 && update({ stroke: { ...el.stroke!, width } })} />
          </div>
        </>
      )}
    </Section>
  );
}
