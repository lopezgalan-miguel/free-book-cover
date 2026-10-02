import { useRef, useState } from "react";
import { formatBytes, type Project } from "@free-book-cover/core";
import { useFonts } from "../fonts/fontContext";
import { useExportServices } from "../export/exportContext";
import { browserExportDeps, downloadBlob } from "../export/exportImage";
import { PDF_STAGES, runPdfExport, type PdfError, type PdfResult, type PdfStage } from "../export/exportPdf";
import { browserPrintRenderer } from "../export/printRender";
import { checkDetail, checkTitle, reportText, statusLabel } from "../export/pdfReportText";
import type { CompanionConnection } from "../export/useCompanion";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { chipBtn, fieldCls } from "../panels/ui";
import { useStore } from "../store/react";

const STATUS_CLS = { pass: "text-ok", warn: "text-warn-ink", fail: "text-danger-ink" } as const;

// Conexión con el companion: estado y formulario de token. Independiente del contenedor.
export function CompanionConnect({ conn }: { conn: CompanionConnection }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(conn.config.baseUrl);
  const [token, setToken] = useState(conn.config.token);
  const msg = conn.status === "checking" ? t("cmpChecking")
    : conn.status === "offline" ? t("cmpOffline", { url: conn.config.baseUrl })
    : conn.status === "needs_token" ? t("cmpNeedsToken") : t("cmpConnected");
  return (
    <section aria-label={t("cmpTitle")} data-testid="companion-status" data-status={conn.status} className="mt-4 rounded-lg border border-line bg-white px-3 py-2.5 text-xs">
      <div className="font-semibold">{t("cmpTitle")}</div>
      <p role="status" className="mt-1 text-subtle">{msg}</p>
      {conn.status !== "connected" && (
        <form className="mt-2 grid gap-1.5" onSubmit={(e) => { e.preventDefault(); void conn.connect({ baseUrl: url.trim(), token: token.trim() }); }}>
          <label className="text-[10px] text-muted" htmlFor="cmp-url">{t("cmpUrl")}</label>
          <input id="cmp-url" className={fieldCls} value={url} onChange={(e) => setUrl(e.target.value)} />
          <label className="text-[10px] text-muted" htmlFor="cmp-token">{t("cmpToken")}</label>
          <input id="cmp-token" className={fieldCls} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className={chipBtn}>{t("cmpConnect")}</button>
            <button type="button" className={chipBtn} onClick={() => void conn.refresh()}>{t("cmpRetry")}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function errorText(t: ReturnType<typeof useI18n>["t"], e: PdfError): string {
  switch (e.kind) {
    case "not_kdp": return t("pdfErrNotKdp");
    case "limit": return t("pdfErrLimit", { mp: e.megapixels.toFixed(1), limit: e.limitMegapixels });
    case "fonts": return `${t("exFontsBlocked")} ${e.problems.map((p) => p.family).join(", ")}`;
    case "missing_assets": return t("exAssetsMissing", { n: e.assetIds.length });
    case "render_failed": return t("exRenderFailed", { message: e.message });
    case "companion": return t(e.reason === "offline" ? "pdfErrOffline" : e.reason === "unauthorized" ? "pdfErrUnauthorized" : "pdfErrFailed");
  }
}

// Generación del PDF de imprenta: progreso, informe de preimpresión, prueba visual y descargas.
export function PdfExportPanel({ conn, doc }: { conn: CompanionConnection; doc: Project }) {
  const { t } = useI18n();
  const store = useStore();
  const fonts = useFonts();
  const services = useExportServices();
  const [stage, setStage] = useState<PdfStage | null>(null);
  const [error, setError] = useState<PdfError | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const getAssets = () => store.getState().assets;
      const base = browserExportDeps(fonts, getAssets);
      const out = await runPdfExport(store.getState().history.present, store.getState().history.present.name, {
        fonts, missingAssets: base.missingAssets,
        renderer: services.pdf?.renderer ?? browserPrintRenderer(fonts, getAssets),
        companion: conn.client, config: conn.config,
      }, setStage);
      if (out.ok) setResult(out.result);
      else setError(out.error);
    } finally {
      running.current = false;
      setBusy(false);
      setStage(null);
    }
  };

  const save = services.download ?? downloadBlob;
  const ready = result?.summary.state === "ready";
  const idx = stage ? PDF_STAGES.indexOf(stage) : -1;
  return (
    <div className="mt-4" data-testid="pdf-panel">
      <button
        onClick={() => void run()} disabled={busy}
        className="w-full rounded-[9px] bg-accent p-[11px] text-[13.5px] font-semibold text-white enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t("pdfRunning") : t("pdfRun")}
      </button>
      {busy && stage && (
        <div className="mt-3 text-xs" data-testid="pdf-progress">
          <progress aria-label={t("pdfProgress")} className="w-full accent-accent" max={PDF_STAGES.length} value={idx + 1} />
          <p role="status" className="mt-1 text-subtle">{idx + 1}/{PDF_STAGES.length} · {t(`pdfStage_${stage}` as DictKey)}</p>
        </div>
      )}
      {error && <div role="alert" data-testid="pdf-error" className="mt-3 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-ink">{errorText(t, error)}</div>}
      {result && (
        <div className="mt-3 text-xs" data-testid="pdf-report" data-state={result.summary.state}>
          <div
            role="status" data-testid="pdf-state"
            className={`rounded-lg border px-3 py-2 font-semibold ${ready ? "border-line bg-white text-ok" : "border-danger-line bg-danger-bg text-danger-ink"}`}
          >
            {ready ? t("pdfReady") : t("pdfNotValidated")}
          </div>
          <h3 className="mb-1 mt-3 text-[10.5px] font-semibold uppercase tracking-[.11em] text-muted">{t("pdfReportTitle")}</h3>
          <ul className="grid gap-1" aria-label={t("pdfReportTitle")}>
            {result.summary.checks.map((c) => (
              <li key={c.id} data-testid={`check-${c.id}`} data-status={c.status} className="rounded-md border border-line-soft bg-white px-2.5 py-1.5">
                <span className={`font-semibold ${STATUS_CLS[c.status]}`}>{statusLabel(t, c)}</span>{" "}
                <span className="font-semibold">{checkTitle(t, c)}</span>
                <div className="text-subtle">{checkDetail(t, c)}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-subtle">{t(result.via === "worker" ? "pdfVia_worker" : "pdfVia_main")}</p>
          {result.proofPng && (
            <figure className="mt-3">
              <img data-testid="pdf-proof" alt={t("pdfProof")} src={`data:image/png;base64,${result.proofPng}`} className="max-h-48 w-full rounded-md border border-line object-contain" />
              <figcaption className="mt-1 text-[11px] text-subtle">{t("pdfProof")}</figcaption>
            </figure>
          )}
          <p className="mt-2 text-[11px] leading-snug text-subtle">{t("pdfDisclaimer")}</p>
          <div className="mt-3 flex gap-2">
            {result.pdf && (
              <button
                data-testid="pdf-download" className={`${chipBtn} flex-1`}
                onClick={() => save(result.pdf!, result.fileName)}
              >
                {ready ? t("pdfDownload") : t("pdfDownloadTrial")} · {formatBytes(result.pdf.size)}
              </button>
            )}
            <button
              data-testid="pdf-download-report" className={chipBtn}
              onClick={() => save(new Blob([reportText(t, result)], { type: "text/plain;charset=utf-8" }), result.reportFileName)}
            >
              {t("pdfDownloadReport")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
