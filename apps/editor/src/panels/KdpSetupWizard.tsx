import { useEffect, useId, useMemo, useState } from "react";
import {
  HARDCOVER, HARDCOVER_TRIMS, PAPERS, SUPPORTED_TRIMS, bindingOf, elementsOutsideCanvas, isLargeTrim, kdpLayout, lowDpiForSetup, trimsFor,
  validatePrintSetup, type Binding, type DpiEntry, type PrintSetup, type Project, type SetupIssue,
} from "@free-book-cover/core";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useEditorState, useStore } from "../store/react";
import { dpiEntryName } from "./dpiNames";
import { chipBtn, fieldCls, toggleBtn } from "./ui";

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
    case "paper_unavailable_for_trim": return t("kdpErrPaperTrim");
    case "paper_unavailable_for_binding": return t("kdpErrPaperBinding");
    case "pages_invalid": return t("kdpErrPagesInvalid");
    case "pages_below_min": return t("kdpErrPagesMin", { n: i.min });
    case "pages_above_max": return t("kdpErrPagesMax", { n: i.max });
  }
}

const fmt = (n: number, d = 4) => String(Number(n.toFixed(d)));
const isHardTrimKey = (k: string) => HARDCOVER_TRIMS.some((s) => trimKey(s.widthIn, s.heightIn) === k);
const HARD_DEFAULT_TRIM = trimKey(HARDCOVER_TRIMS[0]!.widthIn, HARDCOVER_TRIMS[0]!.heightIn);

// Aviso de imágenes por debajo de 300 ppp: qué imagen, cuántos ppp y qué hacer. Lo usa también la exportación.
export function LowDpiAlert({ doc, entries, title, testId }: { doc: Project; entries: DpiEntry[]; title: string; testId: string }) {
  const { t } = useI18n();
  return (
    <div role="note" data-testid={testId} className="rounded-md border border-danger-line bg-danger-bg px-2.5 py-1.5 text-[11px] leading-snug text-danger-ink">
      <p className="font-semibold">{title}</p>
      <ul className="mt-0.5">
        {entries.map((e) => <li key={e.id}>{t("lowDpiItem", { name: dpiEntryName(t, doc, e), dpi: Math.floor(e.dpi) })}</li>)}
      </ul>
      <p className="mt-0.5">{t("lowDpiFix")}</p>
    </div>
  );
}

// Asistente de configuración (corte, páginas, papel). Independiente del contenedor: solo usa el store.
export function KdpSetupWizard() {
  const { t } = useI18n();
  const store = useStore();
  const { history } = useEditorState();
  const doc = history.present;
  const current = doc.printSetup;
  const uid = useId();
  const trimOf = (c: PrintSetup | undefined) =>
    c ? (trimsFor(bindingOf(c)).some((s) => s.widthIn === c.trimWidthIn && s.heightIn === c.trimHeightIn) ? trimKey(c.trimWidthIn, c.trimHeightIn) : CUSTOM) : "6x9";
  const [binding, setBinding] = useState<Binding>(current ? bindingOf(current) : "paperback");
  const [trim, setTrim] = useState(trimOf(current));
  const [cw, setCw] = useState(String(current?.trimWidthIn ?? 6));
  const [ch, setCh] = useState(String(current?.trimHeightIn ?? 9));
  const [pages, setPages] = useState(String(current?.pageCount ?? 100));
  const [paper, setPaper] = useState(current?.paperAndInk ?? "bw-white");
  const [message, setMessage] = useState<string | null>(null);

  // El formulario sigue al documento: deshacer, rehacer o abrir otro proyecto actualizan los campos.
  const projectId = history.present.id;
  useEffect(() => {
    setBinding(current ? bindingOf(current) : "paperback");
    setTrim(trimOf(current));
    setCw(String(current?.trimWidthIn ?? 6));
    setCh(String(current?.trimHeightIn ?? 9));
    setPages(String(current?.pageCount ?? 100));
    setPaper(current?.paperAndInk ?? "bw-white");
    if (!current) setMessage(null);
    // trimOf solo depende de SUPPORTED_TRIMS (constante)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, current?.trimWidthIn, current?.trimHeightIn, current?.pageCount, current?.paperAndInk, current?.binding]);
  useEffect(() => setMessage(null), [projectId]);

  const hard = binding === "hardcover";
  const dimsOf = (k: string) => (k === CUSTOM ? { w: Number(cw), h: Number(ch) } : { w: Number(k.split("x")[0]), h: Number(k.split("x")[1]) });
  const dims = dimsOf(trim);
  const pageCount = pages.trim() === "" ? 0 : Number(pages);
  const setup: PrintSetup = {
    trimWidthIn: dims.w, trimHeightIn: dims.h, pageCount, paperAndInk: paper, readingDirection: "ltr", ...(hard ? { binding: "hardcover" as const } : {}),
  };
  const finite = Number.isFinite(dims.w) && Number.isFinite(dims.h) && Number.isFinite(setup.pageCount);
  const result = finite ? validatePrintSetup(setup) : ({ ok: false, issues: [{ kind: "pages_invalid" }] } as const);
  const layout = result.ok ? kdpLayout(setup) : null;

  // ¿Llegan las imágenes a 300 ppp en tapa dura? Para el botón «Tapa dura», el mejor caso posible (el corte
  // más pequeño, las páginas del formulario acotadas y un papel admitido); para «Aplicar», exactamente lo elegido.
  const bestHard = useMemo((): DpiEntry[] => {
    const d = dimsOf(HARD_DEFAULT_TRIM);
    const pc = Math.min(HARDCOVER.maxPages, Math.max(HARDCOVER.minPages, Math.round(Number.isFinite(pageCount) ? pageCount : 0)));
    const pp = HARDCOVER.papers.includes(paper as never) ? paper : "bw-white";
    return lowDpiForSetup(doc, { trimWidthIn: d.w, trimHeightIn: d.h, pageCount: pc, paperAndInk: pp, readingDirection: "ltr", binding: "hardcover" });
    // dimsOf con un corte fijo no depende del formulario
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageCount, paper]);
  const chosenLow = useMemo(() => (hard && result.ok ? lowDpiForSetup(doc, setup) : []),
    // setup se reconstruye en cada render; sus campos están en la lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, hard, result.ok, dims.w, dims.h, pageCount, paper]);
  const hardBlocked = bestHard.length > 0 && !hard;
  const lowShown = hard ? chosenLow : hardBlocked ? bestHard : [];

  const chooseBinding = (b: Binding) => {
    setBinding(b);
    setMessage(null);
    if (b === "hardcover") {
      if (!isHardTrimKey(trim)) setTrim(HARD_DEFAULT_TRIM);
      if (!HARDCOVER.papers.includes(paper as never)) setPaper("bw-white");
    }
  };

  const apply = () => {
    if (!result.ok || chosenLow.length) return;
    if (!store.dispatch({ type: "setPrintSetup", printSetup: setup })) return;
    const outside = elementsOutsideCanvas(store.getState().history.present).length;
    setMessage(outside ? t("kdpAppliedOutside", { n: outside }) : t("kdpApplied"));
  };

  return (
    <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); apply(); }} aria-label={t("kdpCover")}>
      <div role="group" aria-label={t("kdpBinding")} className="flex gap-1.5">
        {(["paperback", "hardcover"] as const).map((b) => (
          <button
            key={b} type="button" aria-pressed={binding === b} className={`${toggleBtn} flex-1`}
            disabled={b === "hardcover" && hardBlocked} onClick={() => chooseBinding(b)}
          >
            {t(b === "hardcover" ? "kdpHardcover" : "kdpPaperback")}
          </button>
        ))}
      </div>
      {lowShown.length > 0 && <LowDpiAlert doc={doc} entries={lowShown} title={t("hardcoverLowDpi")} testId="hardcover-dpi" />}
      <div>
        <label htmlFor={`${uid}t`} className="mb-1 block text-[10px] text-muted">{t("kdpTrim")}</label>
        <select id={`${uid}t`} className={fieldCls} value={trim} onChange={(e) => setTrim(e.target.value)}>
          {(hard ? HARDCOVER_TRIMS : SUPPORTED_TRIMS).map((s) => (
            <option key={trimKey(s.widthIn, s.heightIn)} value={trimKey(s.widthIn, s.heightIn)}>
              {s.widthIn} × {s.heightIn} in{!hard && isLargeTrim(s.widthIn, s.heightIn) ? ` (${t("kdpTrimLarge")})` : ""}
            </option>
          ))}
          {!hard && <option value={CUSTOM}>{t("kdpTrimCustom")}</option>}
        </select>
      </div>
      {trim === CUSTOM && !hard && (
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
            {PAPERS.filter((p) => !hard || HARDCOVER.papers.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{t(PAPER_LABEL[p.id]!)}</option>)}
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
            {layout.hinges && (
              <>
                <div className="flex justify-between"><dt>{t("kdpWrap")}</dt><dd>{fmt(layout.bleedIn)} in · {fmt(layout.bleedIn * MM_PER_IN, 2)} mm</dd></div>
                <div className="flex justify-between"><dt>{t("kdpHinge")}</dt><dd>{fmt(HARDCOVER.hingeIn)} in · {fmt(HARDCOVER.hingeIn * MM_PER_IN, 2)} mm</dd></div>
              </>
            )}
            <div className="flex justify-between"><dt>{t("kdpTotalSize")}</dt><dd>{fmt(layout.widthIn)} × {fmt(layout.heightIn)} in</dd></div>
          </dl>
          {layout.hinges && <p className="pt-1 font-sans text-[10.5px] leading-snug text-muted">{t("kdpHardcoverNote")}</p>}
          <p className="pt-1 font-sans text-[10.5px] leading-snug text-muted">{t("kdpBleedNote")} {t("kdpZones")}.</p>
          <p className="font-sans text-[10.5px] leading-snug text-muted">{layout.spineTextAllowed ? t("kdpSpineTextOk") : t("kdpSpineTextNo")}</p>
        </div>
      )}
      <button type="submit" className={`${chipBtn} w-full`} disabled={!result.ok || chosenLow.length > 0}>{t("kdpApply")}</button>
      {message && <p role="status" className="text-[11px] text-muted">{message}</p>}
    </form>
  );
}
