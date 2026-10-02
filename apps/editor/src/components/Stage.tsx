import { useEffect, useMemo, useRef, useState } from "react";
import { renderDocument, type Rect } from "@free-book-cover/core";
import { browserMeasure, textHeightIn } from "../canvas/measure";
import { CoverScene } from "../canvas/scene";
import { useFontVersion } from "../fonts/fontContext";
import { useImageSources } from "../canvas/useImageSources";
import { useI18n } from "../i18n";
import { ZOOM_MAX, ZOOM_MIN, type StageTone } from "../store/editorStore";
import { useEditorState, useStore } from "../store/react";

const TONE_CLASS: Record<StageTone, string> = { charcoal: "bg-stage", stone: "bg-stage-stone", linen: "bg-stage-linen" };
const TONES: StageTone[] = ["charcoal", "stone", "linen"];
const TONE_KEY = { charcoal: "toneCharcoal", stone: "toneStone", linen: "toneLinen" } as const;
const MARGIN = 48;

// Sin canvas 2D (p. ej. jsdom) no se puede montar Fabric.
const canvasSupported = () => typeof globalThis.CanvasRenderingContext2D !== "undefined";

// Escenario central: lienzo Fabric con zoom, selección y arrastre. La escala (ppp de vista)
// solo cambia el tamaño en pantalla; el encuadre sale siempre de renderDocument.
export function Stage() {
  const { t } = useI18n();
  const store = useStore();
  const { history, assets, selectedId, zoom, stageTone } = useEditorState();
  const doc = history.present;
  const sources = useImageSources(doc.assets, assets);
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<CoverScene | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const supported = useMemo(canvasSupported, []);
  const measure = useMemo(browserMeasure, []);
  // Cuando una fuente termina de cargar hay que volver a maquetar y pintar.
  const fontVersion = useFontVersion();

  useEffect(() => {
    if (!supported || !host.current) return;
    const el = document.createElement("canvas");
    el.setAttribute("aria-label", t("canvasLabel"));
    host.current.appendChild(el);
    const sc = new CoverScene(el, {
      onSelect: (id) => store.select(id),
      onTransform: (id, box: Rect, rotation) => {
        const ppi = pxPerInchRef.current;
        const el = store.getState().history.present.elements.find((e) => e.id === id);
        const props = { x: box.x / ppi, y: box.y / ppi, width: box.width / ppi, height: box.height / ppi, rotation };
        // En un bloque de texto el alto lo da el contenido: solo el ancho se controla a mano.
        if (el?.type === "text") {
          const m = browserMeasure();
          if (m) props.height = textHeightIn({ ...el, width: props.width }, m);
        }
        store.dispatch({ type: "updateElement", id, props });
      },
      onBackgroundPan: (pos) => store.dispatch({ type: "setBackgroundLayout", pos }),
    });
    setScene(sc);
    if (import.meta.env.DEV) (window as unknown as { __coverScene?: CoverScene }).__coverScene = sc;
    return () => {
      setScene(null);
      sc.dispose();
      el.parentElement?.replaceChildren();
    };
    // La escena se crea una vez por montaje; los callbacks leen siempre el store actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, store]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      store.setZoom(store.getState().zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, [store, supported]);

  // 100 % = el lienzo cabe entero en el escenario.
  const fit = area.w > 0 && area.h > 0 ? Math.min((area.w - MARGIN) / doc.canvas.widthIn, (area.h - MARGIN) / doc.canvas.heightIn) : 60;
  const pxPerInch = Math.max(1, fit) * zoom;
  const pxPerInchRef = useRef(pxPerInch);
  pxPerInchRef.current = pxPerInch;

  useEffect(() => {
    if (!scene) return;
    const r = renderDocument(doc, { pxPerInch, ...(measure ? { measureText: measure } : {}) });
    scene.render(doc, r, sources, store.getState().selectedId, { width: Math.round(r.widthPx), height: Math.round(r.heightPx) });
  }, [scene, doc, pxPerInch, sources, store, measure, fontVersion]);

  // Cambiar la selección no reconstruye la escena.
  useEffect(() => {
    scene?.setSelection(selectedId);
  }, [scene, selectedId, doc, pxPerInch, sources]);

  // La selección solo es válida si el elemento sigue existiendo (borrado o deshacer).
  useEffect(() => {
    if (selectedId && !doc.elements.some((e) => e.id === selectedId)) store.select(null);
  }, [doc, selectedId, store]);

  return (
    <main className={`relative flex min-w-0 flex-1 overflow-hidden ${TONE_CLASS[stageTone]}`}>
      {supported ? (
        <div ref={scroller} className="flex min-h-0 min-w-0 flex-1 overflow-auto p-6">
          <div ref={host} data-testid="cover-canvas" className="m-auto flex-none shadow-[0_18px_60px_rgba(0,0,0,.45)]" />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div data-testid="canvas-placeholder" className="border border-dashed border-white/25 px-5 py-10 text-center font-mono text-xs tracking-[.04em] text-white/50">
            {t("stagePlaceholder")}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg bg-black/40 p-1 text-xs text-white">
        {TONES.map((tone) => (
          <button
            key={tone}
            aria-label={`${t("stageTone")}: ${t(TONE_KEY[tone])}`}
            aria-pressed={stageTone === tone}
            title={t(TONE_KEY[tone])}
            onClick={() => store.setStageTone(tone)}
            className={`h-5 w-5 rounded-full border border-white/40 ${TONE_CLASS[tone]} aria-pressed:ring-2 aria-pressed:ring-accent`}
          />
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-black/40 p-1 font-mono text-xs text-white">
        <button aria-label={t("zoomOut")} className="h-6 w-6 rounded hover:bg-white/15 disabled:opacity-40" disabled={zoom <= ZOOM_MIN} onClick={() => store.setZoom(zoom / 1.25)}>−</button>
        <button aria-label={t("zoomFit")} className="min-w-12 rounded px-1 hover:bg-white/15" data-testid="zoom-level" onClick={() => store.setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button aria-label={t("zoomIn")} className="h-6 w-6 rounded hover:bg-white/15 disabled:opacity-40" disabled={zoom >= ZOOM_MAX} onClick={() => store.setZoom(zoom * 1.25)}>+</button>
      </div>
    </main>
  );
}
