import { useState } from "react";
import { loadCompanionConfig, saveCompanionConfig } from "../export/companionClient";
import { useI18n } from "../i18n";
import type { DictKey } from "../i18n/dictionaries";
import { useMcpBridge, useMcpSnapshot } from "../mcp/context";
import type { McpFailure } from "../mcp/bridge";
import { chipBtn, fieldCls } from "../panels/ui";
import { useEditorState } from "../store/react";

const FAILURE_KEY: Record<McpFailure, DictKey> = {
  unreachable: "mcpFailUnreachable", unauthorized: "mcpFailUnauthorized", replaced: "mcpFailReplaced", protocol: "mcpFailProtocol",
};

// Conexión MCP: conectar con el companion y autorizar (o revocar) el proyecto abierto. Independiente del contenedor.
export function McpPanel() {
  const { t } = useI18n();
  const bridge = useMcpBridge();
  const snap = useMcpSnapshot();
  const { history } = useEditorState();
  const doc = history.present;
  const [cfg, setCfg] = useState(() => loadCompanionConfig());
  const connected = snap.link === "connected";
  const authorized = snap.authorizedProjectId === doc.id;
  const status = snap.link === "connecting" ? t("mcpConnecting")
    : connected ? (authorized ? t("mcpStatusAuthorized") : t("mcpStatusConnected"))
    : snap.failure ? t(FAILURE_KEY[snap.failure]) : t("mcpStatusOff");

  return (
    <section aria-label={t("mcpTitle")} className="grid gap-3 text-xs" data-testid="mcp-panel" data-link={snap.link} data-authorized={authorized}>
      <p className="text-subtle">{t("mcpIntro")}</p>
      <p role="status" className="font-semibold" data-testid="mcp-status">{status}</p>
      {!connected ? (
        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const next = { baseUrl: cfg.baseUrl.trim(), token: cfg.token.trim() };
            saveCompanionConfig(next);
            bridge.connect(next);
          }}
        >
          <label className="text-[10px] text-muted" htmlFor="mcp-url">{t("cmpUrl")}</label>
          <input id="mcp-url" className={fieldCls} value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
          <label className="text-[10px] text-muted" htmlFor="mcp-token">{t("cmpToken")}</label>
          <input id="mcp-token" className={fieldCls} type="password" autoComplete="off" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" className={chipBtn} disabled={snap.link === "connecting"}>{t("mcpConnect")}</button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          <div className="rounded-lg border border-line bg-white px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[.11em] text-muted">{t("mcpProject")}</div>
            <div className="mt-0.5 font-mono text-[12.5px]" data-testid="mcp-project">{doc.name || t("mcpUnnamed")} · {doc.id.slice(0, 8)}</div>
            <p className="mt-1.5 text-subtle">{authorized ? t("mcpAuthorizedHint") : t("mcpUnauthorizedHint")}</p>
            <div className="mt-2 flex gap-2">
              {authorized
                ? <button type="button" className={chipBtn} onClick={() => bridge.revoke()}>{t("mcpRevoke")}</button>
                : <button type="button" className={chipBtn} onClick={() => bridge.authorize()}>{t("mcpAuthorize")}</button>}
              <button type="button" className={chipBtn} onClick={() => bridge.disconnect()}>{t("mcpDisconnect")}</button>
            </div>
          </div>
          <p data-testid="mcp-clients" className="text-subtle">{t("mcpClients", { n: snap.mcpClients })}</p>
        </div>
      )}
      {snap.activity.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[.11em] text-muted">{t("mcpActivity")}</div>
          <ul className="grid gap-0.5 font-mono text-[11px]" data-testid="mcp-activity">
            {snap.activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className={a.ok ? "text-ok" : "text-danger-ink"}>{a.tool} · {a.ok ? t("mcpOk") : (a.errorKind ?? "error")}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
