import { useId, useMemo, useState } from "react";
import {
  DEFAULT_EXPORT_QUALITY, DEFAULT_PX_PER_IN, EXPORT_FORMATS, checkExportSize, formatBytes, formatInfo, isResolvedTarget, printPixelSize, variantDocument,
  type ExportFormat, type ExportReport, type Project, type ResolvedTarget,
} from "@free-book-cover/core";
import { useFonts } from "../fonts/fontContext";
import { useExportServices } from "../export/exportContext";
import { useCompanion } from "../export/useCompanion";
import { CompanionConnect, PdfExportPanel } from "./PdfExportPanel";
import { useModal } from "./useModal";
import { browserExportDeps, downloadBlob, runExport, type ExportError } from "../export/exportImage";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { targetLabel } from "../panels/variantLabels";
import { chipBtn, fieldCls } from "../panels/ui";
import { useEditorState, useStore } from "../store/react";

const BASE = "base";
const SCALES = [1, 0.75, 0.5, 0.25] as const;
const FORMAT_DESC: Record<ExportFormat, DictKey> = { png: "dPng", jpeg: "dJpeg", webp: "dWebp" };
const FORMAT_LABEL: Record<ExportFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" };

// Modal de exportación de imagen (PNG/JPEG/WebP) del diseño base o de una variante. Independiente del contenedor.
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Dialog onClose={onClose} />;
}

function Dialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const store = useStore();
  const fonts = useFonts();
  const services = useExportServices();
  const { history, activeVariantId } = useEditorState();
  const base = history.present;
  const targets = (base.digitalTargets ?? []).filter(isResolvedTarget);
  const [destId, setDestId] = useState<string>(targets.some((x) => x.id === activeVariantId) ? activeVariantId! : BASE);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(DEFAULT_EXPORT_QUALITY);
  const [scale, setScale] = useState<number>(1);
  // Tamaño máximo que cabe en el límite de megapíxeles, ofrecido tras un rechazo (solo diseño base).
  const [reduced, setReduced] = useState<{ widthPx: number; heightPx: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // PDF de imprenta (Paso 7): solo el diseño base de una cubierta KDP configurada y con el companion conectado.
  const [pdf, setPdf] = useState(false);
  const isKdpBase = base.mode === "kdp-paperback" && !!base.printSetup;
  const companion = useCompanion(isKdpBase);
  const pdfEligible = isKdpBase && destId === BASE;
  const pdfEnabled = pdfEligible && companion.status === "connected";
  const pdfOn = pdf && pdfEnabled;
  const [error, setError] = useState<ExportError | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const titleId = useId();

  const target: ResolvedTarget | null = targets.find((x) => x.id === destId) ?? null;
  const allowed: readonly ExportFormat[] = target?.formats ?? ["png", "jpeg", "webp"];
  const effFormat: ExportFormat = allowed.includes(format) ? format : allowed[0]!;
  const destLabel = target ? targetLabel(t, target) : t("variantsBase");
  const size = useMemo(() => {
    if (pdfOn) return printPixelSize(base.canvas.widthIn, base.canvas.heightIn);
    if (target) return { widthPx: target.widthPx, heightPx: target.heightPx };
    if (reduced) return reduced;
    return { widthPx: Math.max(1, Math.round(base.canvas.widthIn * DEFAULT_PX_PER_IN * scale)), heightPx: Math.max(1, Math.round(base.canvas.heightIn * DEFAULT_PX_PER_IN * scale)) };
  }, [pdfOn, target, reduced, base.canvas.widthIn, base.canvas.heightIn, scale]);
  const limit = checkExportSize(size.widthPx, size.heightPx);
  const lossy = formatInfo(effFormat).lossy;

  const { root, onKeyDown } = useModal(onClose);

  const docFor = (): Project => (target ? variantDocument(store.getState().history.present, target) : store.getState().history.present);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const deps = services.deps ?? browserExportDeps(fonts, () => store.getState().assets);
      const doc = docFor();
      const r = await runExport({
        doc, widthPx: size.widthPx, heightPx: size.heightPx, format: effFormat, quality, destination: destLabel,
        projectName: store.getState().history.present.name, allowedFormats: allowed,
      }, deps);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      (services.download ?? downloadBlob)(r.blob, r.report.fileName);
      setReport(r.report);
    } finally {
      setBusy(false);
    }
  };

  const retryFonts = async () => {
    setBusy(true);
    try {
      const d = docFor();
      await fonts.retryFailed(d, store.getState().assets);
      // Solo se limpia el aviso si de verdad se recuperaron las fuentes.
      const again = fonts.checkFontsReady(d);
      setError(again.ok ? null : { kind: "fonts", problems: again.problems });
    } finally {
      setBusy(false);
    }
  };

  const reduceTo = (px: { widthPx: number; heightPx: number }) => {
    setReduced(px);
    setError(null);
  };

  const limitMsg = !limit.ok && limit.error.kind === "export_too_many_megapixels"
    ? t("exLimit", { mp: limit.error.megapixels.toFixed(1), limit: limit.error.limitMegapixels })
    : null;
  const suggested = !limit.ok && "suggested" in limit ? limit.suggested : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(30,26,20,.5)] backdrop-blur-[2px]"
      onMouseDown={onClose}
      data-testid="export-backdrop"
    >
      <div
        ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-[440px] max-w-[92vw] overflow-y-auto rounded-2xl bg-panel shadow-[0_30px_80px_rgba(0,0,0,.4)] outline-none"
      >
        <div className="border-b border-line-soft px-[22px] pb-4 pt-5">
          <h2 id={titleId} className="text-base font-semibold">{t("exTitle")}</h2>
          <div className="mt-[3px] text-[12.5px] text-muted">
            {t("exRes")} <span className="font-mono text-accent-dark" data-testid="export-size">{size.widthPx}×{size.heightPx} px</span>
            {" "}· {(size.widthPx * size.heightPx / 1e6).toFixed(2)} MP
          </div>
        </div>
        <div className="px-[22px] py-[18px]">
          <label htmlFor="export-dest" className="mb-2.5 block text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted">{t("exDestination")}</label>
          <select id="export-dest" className={fieldCls} value={destId} onChange={(e) => { setDestId(e.target.value); setError(null); setReport(null); }}>
            <option value={BASE}>{t("variantsBase")}</option>
            {targets.map((x) => <option key={x.id} value={x.id}>{targetLabel(t, x)} ({x.widthPx}×{x.heightPx})</option>)}
          </select>

          {!target && (
            <div className="mt-3">
              <label htmlFor="export-scale" className="mb-1 block text-[10px] text-muted">{t("exScale")}</label>
              <select id="export-scale" className={`${fieldCls} w-auto`} value={reduced ? "reduced" : scale} onChange={(e) => { setReduced(null); setScale(Number(e.target.value)); }}>
                {SCALES.map((s) => <option key={s} value={s}>{Math.round(s * 100)} %</option>)}
                {reduced && <option value="reduced">{reduced.widthPx}×{reduced.heightPx} px</option>}
              </select>
            </div>
          )}

          <div className="mb-2.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted">{t("exFormat")}</div>
          <div className="grid grid-cols-2 gap-[9px]" role="radiogroup" aria-label={t("exFormat")}>
            {EXPORT_FORMATS.map((f) => {
              const ok = allowed.includes(f.format);
              return (
                <button
                  key={f.format} role="radio" aria-checked={!pdfOn && effFormat === f.format} disabled={!ok}
                  title={ok ? undefined : t("exFormatNotAllowed")}
                  onClick={() => { setFormat(f.format); setPdf(false); }}
                  className="rounded-[9px] border border-field bg-white px-3 py-2.5 text-left enabled:hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40 aria-checked:border-accent aria-checked:bg-chip-on"
                >
                  <div className="text-[13.5px] font-semibold">{FORMAT_LABEL[f.format]}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-subtle">{t(FORMAT_DESC[f.format])}</div>
                </button>
              );
            })}
            {isKdpBase && (
              <button
                role="radio" aria-checked={pdfOn} disabled={!pdfEnabled} onClick={() => setPdf(true)}
                className="rounded-[9px] border border-field bg-white px-3 py-2.5 text-left enabled:hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40 aria-checked:border-accent aria-checked:bg-chip-on"
              >
                <div className="text-[13.5px] font-semibold">PDF</div>
                <div className="mt-0.5 text-[11px] leading-tight text-subtle">{t("pdfDesc")}</div>
              </button>
            )}
          </div>
          {isKdpBase && !pdfEnabled && (
            <p data-testid="pdf-disabled-reason" className="mt-2 text-[11.5px] leading-snug text-subtle">
              {pdfEligible ? t("pdfNeedsCompanion") : t("pdfNeedsKdp")}
            </p>
          )}
          {isKdpBase && pdfEligible && <CompanionConnect conn={companion} />}
          {pdfOn && <PdfExportPanel conn={companion} doc={base} />}
          {!pdfOn && lossy && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[11px] text-subtle">
                <label htmlFor="export-quality">{t("exQ")}</label>
                <span className="font-mono text-muted">{quality}%</span>
              </div>
              <input id="export-quality" type="range" className="w-full accent-accent" min={1} max={100} step={1} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </div>
          )}
          {!pdfOn && <p className="mt-4 text-[11.5px] leading-snug text-subtle">{t("exInfo")}</p>}

          {limitMsg && (
            <div role="alert" data-testid="export-limit" className="mt-3 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-ink">
              <p>{limitMsg}</p>
              {target ? <p className="mt-1">{t("exLimitVariant")}</p> : suggested && (
                <button className={`${chipBtn} mt-1.5`} onClick={() => reduceTo(suggested)}>{t("exReduce", { w: suggested.widthPx, h: suggested.heightPx })}</button>
              )}
            </div>
          )}
          {error && error.kind !== "limit" && (
            <div role="alert" data-testid="export-error" className="mt-3 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-ink">
              <ErrorBody error={error} size={size} />
              {error.kind === "fonts" && (
                <button className={`${chipBtn} mt-1.5`} disabled={busy} onClick={() => void retryFonts()}>{t("fontRetry")}</button>
              )}
            </div>
          )}
          {report && (
            <dl role="status" data-testid="export-report" className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-3 py-2 text-xs">
              <dt className="text-muted">{t("exReportFormat")}</dt><dd className="font-mono">{FORMAT_LABEL[report.format]}{report.quality !== undefined ? ` · ${report.quality}%` : ""}</dd>
              <dt className="text-muted">{t("exReportSize")}</dt><dd className="font-mono">{report.widthPx}×{report.heightPx} px · {report.megapixels.toFixed(2)} MP</dd>
              <dt className="text-muted">{t("exReportWeight")}</dt><dd className="font-mono">{formatBytes(report.bytes)}</dd>
              <dt className="text-muted">{t("exReportDestination")}</dt><dd>{report.destination}</dd>
              <dt className="text-muted">{t("exReportFile")}</dt><dd className="break-all font-mono">{report.fileName}</dd>
            </dl>
          )}
        </div>
        <div className="flex gap-2.5 px-[22px] pb-5">
          <button onClick={onClose} className="flex-none rounded-[9px] border border-field bg-white px-[18px] py-[11px] text-[13px] text-chip-ink hover:bg-chip">
            {report ? t("close") : t("cancel")}
          </button>
          {!pdfOn && <button
            onClick={() => void doExport()} disabled={busy || !limit.ok}
            className="flex-1 rounded-[9px] bg-accent p-[11px] text-[13.5px] font-semibold text-on-accent enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("exExporting") : `${t("download")} ${FORMAT_LABEL[effFormat]}`}
          </button>}
        </div>
      </div>
    </div>
  );
}

function ErrorBody({ error, size }: { error: ExportError; size: { widthPx: number; heightPx: number } }) {
  const { t } = useI18n();
  switch (error.kind) {
    case "fonts":
      return (
        <>
          <p>{t("exFontsBlocked")}</p>
          <ul className="mt-1 list-disc pl-4">
            {error.problems.map((p) => (
              <li key={p.family} data-testid="export-font-problem">{t(p.reason === "failed" ? "exFontFailed" : p.reason === "missing" ? "exFontMissing" : "exFontLoading", { family: p.family })}</li>
            ))}
          </ul>
        </>
      );
    case "missing_assets":
      return <p>{t("exAssetsMissing", { n: error.assetIds.length })}</p>;
    case "format_not_allowed":
      return <p>{t("exFormatNotAllowed")}</p>;
    case "encode_unsupported":
      return <p>{t("exEncodeUnsupported", { format: FORMAT_LABEL[error.format] })}</p>;
    case "encode_failed":
      return <p>{t("exEncodeFailed", { w: size.widthPx, h: size.heightPx })}</p>;
    case "render_failed":
      return <p>{t("exRenderFailed", { message: error.message })}</p>;
    case "limit":
      return null;
  }
}
