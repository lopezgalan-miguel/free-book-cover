import { useEffect, useId, useState } from "react";
import {
  PAPERS, SUPPORTED_TRIMS, elementsOutsideCanvas, kdpLayout, validatePrintSetup, type PrintSetup, type SetupIssue,
} from "@free-book-cover/core";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";
import { chipBtn, fieldCls } from "./ui";

const PAPER_LABEL: Record<string, DictKey> = {
  "bw-white": "kdpPaperBwWhite", "bw-cream": "kdpPaperBwCream", "color-standard": "kdpPaperColorStandard", "color-premium": "kdpPaperColorPremium",
};
const trimKey = (w: number, h: number) => `${w}x${h}`;
const CUSTOM = "custom";
const MM_PER_IN = 25.4;

export function issueMessage(t: (k: DictKey, v?: Record<string, string | number>) => string, i: SetupIssue): string {
  switch (i.kind) {
    case "trim_out_of_range": return t("kdpErrTrimRange");
    case "trim_unsupported": return t("kdpErrTrimUnsupported");
    case "paper_unsupported": return t("kdpErrPaper");
    case "pages_invalid": return t("kdpErrPagesInvalid");
    case "pages_below_min": return t("kdpErrPagesMin", { n: i.min });
    case "pages_above_max": return t("kdpErrPagesMax", { n: i.max });
  }
}

const fmt = (n: number, d = 4) => String(Number(n.toFixed(d)));

// Asistente de configuración (corte, páginas, papel). Independiente del contenedor: solo usa el store.
export function KdpSetupWizard() {
  const { t } = useI18n();
  const store = useStore();
  const { history } = useEditorState();
  const current = history.present.printSetup;
  const uid = useId();
  const trimOf = (c: PrintSetup | undefined) =>
    c ? (SUPPORTED_TRIMS.some((s) => s.widthIn === c.trimWidthIn && s.heightIn === c.trimHeightIn) ? trimKey(c.trimWidthIn, c.trimHeightIn) : CUSTOM) : "6x9";
  const [trim, setTrim] = useState(trimOf(current));
  const [cw, setCw] = useState(String(current?.trimWidthIn ?? 6));
  const [ch, setCh] = useState(String(current?.trimHeightIn ?? 9));
  const [pages, setPages] = useState(String(current?.pageCount ?? 100));
  const [paper, setPaper] = useState(current?.paperAndInk ?? "bw-white");
  const [message, setMessage] = useState<string | null>(null);

  // El formulario sigue al documento: deshacer, rehacer o abrir otro proyecto actualizan los campos.
  const projectId = history.present.id;
  useEffect(() => {
    setTrim(trimOf(current));
    setCw(String(current?.trimWidthIn ?? 6));
    setCh(String(current?.trimHeightIn ?? 9));
    setPages(String(current?.pageCount ?? 100));
    setPaper(current?.paperAndInk ?? "bw-white");
    if (!current) setMessage(null);
    // trimOf solo depende de SUPPORTED_TRIMS (constante)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, current?.trimWidthIn, current?.trimHeightIn, current?.pageCount, current?.paperAndInk]);
  useEffect(() => setMessage(null), [projectId]);

  const dims = trim === CUSTOM ? { w: Number(cw), h: Number(ch) } : { w: Number(trim.split("x")[0]), h: Number(trim.split("x")[1]) };
  const setup: PrintSetup = {
    trimWidthIn: dims.w, trimHeightIn: dims.h, pageCount: pages.trim() === "" ? 0 : Number(pages), paperAndInk: paper, readingDirection: "ltr",
  };
  const finite = Number.isFinite(dims.w) && Number.isFinite(dims.h) && Number.isFinite(setup.pageCount);
  const result = finite ? validatePrintSetup(setup) : ({ ok: false, issues: [{ kind: "pages_invalid" }] } as const);
  const layout = result.ok ? kdpLayout(setup) : null;

  const apply = () => {
    if (!result.ok) return;
    if (!store.dispatch({ type: "setPrintSetup", printSetup: setup })) return;
    const outside = elementsOutsideCanvas(store.getState().history.present).length;
    setMessage(outside ? t("kdpAppliedOutside", { n: outside }) : t("kdpApplied"));
  };

  return (
    <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); apply(); }} aria-label={t("kdpCover")}>
      <div>
        <label htmlFor={`${uid}t`} className="mb-1 block text-[10px] text-muted">{t("kdpTrim")}</label>
        <select id={`${uid}t`} className={fieldCls} value={trim} onChange={(e) => setTrim(e.target.value)}>
          {SUPPORTED_TRIMS.map((s) => <option key={trimKey(s.widthIn, s.heightIn)} value={trimKey(s.widthIn, s.heightIn)}>{s.widthIn} × {s.heightIn} in</option>)}
          <option value={CUSTOM}>{t("kdpTrimCustom")}</option>
        </select>
      </div>
      {trim === CUSTOM && (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}w`} className="mb-1 block text-[10px] text-muted">{t("kdpTrimWidth")}</label>
            <input id={`${uid}w`} type="number" step="any" className={fieldCls} value={cw} onChange={(e) => setCw(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}h`} className="mb-1 block text-[10px] text-muted">{t("kdpTrimHeight")}</label>
            <input id={`${uid}h`} type="number" step="any" className={fieldCls} value={ch} onChange={(e) => setCh(e.target.value)} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${uid}p`} className="mb-1 block text-[10px] text-muted">{t("kdpPages")}</label>
          <input id={`${uid}p`} type="number" step="1" min="1" className={fieldCls} value={pages} onChange={(e) => setPages(e.target.value)} />
        </div>
        <div className="min-w-0 flex-[1.4]">
          <label htmlFor={`${uid}i`} className="mb-1 block text-[10px] text-muted">{t("kdpPaper")}</label>
          <select id={`${uid}i`} className={fieldCls} value={paper} onChange={(e) => setPaper(e.target.value)}>
            {PAPERS.map((p) => <option key={p.id} value={p.id}>{t(PAPER_LABEL[p.id]!)}</option>)}
          </select>
        </div>
      </div>

      {!result.ok && (
        <ul role="alert" className="space-y-0.5 text-[11px] text-danger">
          {result.issues.map((i) => <li key={i.kind}>{issueMessage(t, i)}</li>)}
        </ul>
      )}
      {layout && (
        <div data-testid="kdp-summary" className="space-y-0.5 rounded-lg border border-line-soft bg-white p-2 font-mono text-[11px]">
          <dl className="space-y-0.5">
            <div className="flex justify-between"><dt>{t("kdpSpine")}</dt><dd>{fmt(layout.spineIn)} in · {fmt(layout.spineIn * MM_PER_IN, 2)} mm</dd></div>
            <div className="flex justify-between"><dt>{t("kdpTotalSize")}</dt><dd>{fmt(layout.widthIn)} × {fmt(layout.heightIn)} in</dd></div>
          </dl>
          <p className="pt-1 font-sans text-[10.5px] leading-snug text-muted">{t("kdpBleedNote")} {t("kdpZones")}.</p>
          <p className="font-sans text-[10.5px] leading-snug text-muted">{layout.spineTextAllowed ? t("kdpSpineTextOk") : t("kdpSpineTextNo")}</p>
        </div>
      )}
      <button type="submit" className={`${chipBtn} w-full`} disabled={!result.ok}>{t("kdpApply")}</button>
      {message && <p role="status" className="text-[11px] text-muted">{message}</p>}
    </form>
  );
}
