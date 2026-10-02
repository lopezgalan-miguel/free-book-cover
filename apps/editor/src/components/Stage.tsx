import { useI18n } from "../i18n";
import { useEditorState } from "../store/react";

// Escenario carbón; el lienzo (Fabric) llega en el paso siguiente.
export function Stage() {
  const { t } = useI18n();
  const { history } = useEditorState();
  const { widthIn, heightIn } = history.present.canvas;
  const ratio = widthIn / heightIn;
  return (
    <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-stage">
      <div
        data-testid="canvas-placeholder"
        style={{ aspectRatio: String(ratio), height: ratio >= 1 ? undefined : "min(70%, 606px)", width: ratio >= 1 ? "min(70%, 540px)" : undefined }}
        className="flex items-center justify-center border border-dashed border-white/25 px-5 text-center font-mono text-xs tracking-[.04em] text-white/50"
      >
        {t("stagePlaceholder")}
      </div>
    </main>
  );
}
