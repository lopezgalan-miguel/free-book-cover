import { useRef } from "react";
import { dpiReport } from "@free-book-cover/core";
import { useAssetUrl } from "../canvas/useImageSources";
import { importImage } from "../images/importImage";
import { useI18n } from "../i18n";
import { useEditorState, useStore } from "../store/react";
import { chipBtn, NumberField, Section } from "./ui";

// Fondo: imagen o color, con encuadre Rellenar/Ajustar/Centrar. Independiente del contenedor.
export function BackgroundPanel() {
  const { t } = useI18n();
  const store = useStore();
  const { history, assets } = useEditorState();
  const canvas = history.present.canvas;
  const assetId = typeof canvas.background === "object" ? canvas.background.assetId : null;
  const thumb = useAssetUrl(assets, assetId);
  const input = useRef<HTMLInputElement>(null);
  const fit = canvas.backgroundFit ?? "cover";
  const pos = canvas.backgroundPos ?? { x: 0.5, y: 0.5 };
  const dpi = assetId ? dpiReport(history.present).find((e) => e.id === "background") : undefined;

  return (
    <Section title={t("bg")}>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-dashed border-dash bg-card px-3 py-2.5 hover:bg-white focus-within:ring-2 focus-within:ring-accent">
        <div
          className="h-[52px] w-[38px] flex-none rounded border border-field bg-stage bg-cover bg-center"
          style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium">{assetId ? t("imgCh") : t("imgUp")}</div>
          <div className="text-[10.5px] text-muted">{t("formatsHint")}</div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={assetId ? t("imgCh") : t("imgUp")}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importImage(store, f, "background");
          }}
        />
      </label>
      {assetId ? (
        <>
          <div className="mt-[9px] flex gap-1.5">
            <button className={`${chipBtn} flex-1`} aria-pressed={fit === "cover"} onClick={() => store.dispatch({ type: "setBackgroundLayout", fit: "cover" })}>{t("fill")}</button>
            <button className={`${chipBtn} flex-1`} aria-pressed={fit === "contain"} onClick={() => store.dispatch({ type: "setBackgroundLayout", fit: "contain" })}>{t("fit")}</button>
            <button className={chipBtn} onClick={() => store.dispatch({ type: "setBackgroundLayout", pos: { x: 0.5, y: 0.5 } })}>{t("center")}</button>
          </div>
          <div className="mt-2 flex gap-2">
            <NumberField label={t("bgPosX")} value={pos.x * 100} min={0} max={100} digits={1} onCommit={(v) => store.dispatch({ type: "setBackgroundLayout", pos: { x: Math.min(100, Math.max(0, v)) / 100, y: pos.y } })} />
            <NumberField label={t("bgPosY")} value={pos.y * 100} min={0} max={100} digits={1} onCommit={(v) => store.dispatch({ type: "setBackgroundLayout", pos: { x: pos.x, y: Math.min(100, Math.max(0, v)) / 100 } })} />
          </div>
          <p className="mt-[7px] text-[10.5px] leading-snug text-muted">{t("bgHint")}</p>
          {dpi && (
            <p className={`mt-1 font-mono text-[10.5px] ${dpi.lowDpi ? "text-warn-ink" : "text-muted"}`}>
              {t("dpiEffective", { dpi: Math.round(dpi.dpi) })}
            </p>
          )}
          <button className={`${chipBtn} mt-2`} onClick={() => store.dispatch({ type: "setBackground", background: "#ffffff" })}>{t("removeBg")}</button>
        </>
      ) : (
        <p className="mt-2 text-[10.5px] text-muted">{t("bgNone")}</p>
      )}
    </Section>
  );
}
