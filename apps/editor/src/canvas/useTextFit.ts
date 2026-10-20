import { useEffect, useRef } from "react";
import { fitTextBox, type Command, type TextMeasure } from "@free-book-cover/core";
import { useFonts, useFontVersion } from "../fonts/fontContext";
import { useEditorState, useStore } from "../store/react";
import { browserMeasure } from "./measure";

// Mantiene ajustada la caja de cada texto visible del diseño base (ancho hasta la palabra más larga y alto
// del contenido). Espera a las fuentes en carga, junta todos los parches en un solo amend (sin paso de
// deshacer) y no reajusta si el documento sigue en la revisión que dejó el propio ajuste.
export function useTextFit(opts: { measure?: TextMeasure | null } = {}): void {
  const measure = opts.measure === undefined ? browserMeasure() : opts.measure;
  const store = useStore();
  const fonts = useFonts();
  const fontVersion = useFontVersion();
  const { ready, history } = useEditorState();
  const doc = history.present;
  const fitted = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || !measure || fitted.current === doc.revision) return;
    const report = fonts.checkFontsReady(doc);
    const waiting = new Set<string>();
    if (!report.ok) for (const p of report.problems) if (p.reason === "loading" || p.reason === "not_loaded") for (const id of p.elementIds) waiting.add(id);
    const cmds: Command[] = [];
    for (const el of doc.elements) {
      if (el.type !== "text" || !el.visible || waiting.has(el.id)) continue;
      const fit = fitTextBox(el, measure);
      if (fit) cmds.push({ type: "updateElement", id: el.id, props: fit });
    }
    if (cmds.length === 0) return;
    if (store.amend(cmds)) fitted.current = store.getState().history.present.revision;
  }, [ready, doc, fontVersion, measure, fonts, store]);
}
