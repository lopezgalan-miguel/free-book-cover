import type { CompanionReport } from "@free-book-cover/core";

export const DEFAULT_COMPANION_URL = "http://127.0.0.1:47321";

export interface CompanionConfig {
  baseUrl: string;
  token: string;
}

// offline: no responde; needs_token: responde pero el token falta o no vale; connected: listo para preimpresión.
export type CompanionStatus = "offline" | "needs_token" | "connected";

export interface PreflightResponse {
  id: string | null;
  report: CompanionReport;
  // Prueba visual (PNG en base64) del PDF CMYK.
  proofPng: string | null;
}

export class CompanionError extends Error {
  constructor(public kind: "offline" | "unauthorized" | "failed", message: string) {
    super(message);
  }
}

type Fetch = typeof fetch;

// Cliente HTTP del companion local (POST /preflight con token). `fetchImpl` permite probarlo sin red.
export interface CompanionClient {
  health(cfg: CompanionConfig): Promise<CompanionStatus>;
  preflight(cfg: CompanionConfig, png: Blob, widthIn: number, heightIn: number): Promise<PreflightResponse>;
  downloadPdf(cfg: CompanionConfig, id: string): Promise<Blob>;
}

const auth = (cfg: CompanionConfig): HeadersInit => (cfg.token ? { authorization: `Bearer ${cfg.token}` } : {});
const base = (cfg: CompanionConfig) => cfg.baseUrl.replace(/\/+$/, "");

export function createCompanionClient(fetchImpl: Fetch = (...a) => fetch(...a)): CompanionClient {
  const call = async (url: string, init: RequestInit): Promise<Response> => {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch {
      throw new CompanionError("offline", "companion no disponible");
    }
    if (res.status === 401) throw new CompanionError("unauthorized", "token no válido");
    if (!res.ok) throw new CompanionError("failed", `companion respondió ${res.status}`);
    return res;
  };
  return {
    async health(cfg) {
      try {
        const res = await fetchImpl(`${base(cfg)}/health`, { headers: auth(cfg) });
        if (!res.ok) return "offline";
        const j = (await res.json()) as { ok?: boolean; authorized?: boolean };
        if (!j.ok) return "offline";
        return j.authorized ? "connected" : "needs_token";
      } catch {
        return "offline";
      }
    },
    async preflight(cfg, png, widthIn, heightIn) {
      const res = await call(`${base(cfg)}/preflight?widthIn=${widthIn}&heightIn=${heightIn}`, {
        method: "POST", body: png, headers: { ...auth(cfg), "content-type": "image/png" },
      });
      return (await res.json()) as PreflightResponse;
    },
    async downloadPdf(cfg, id) {
      const res = await call(`${base(cfg)}/preflight/${encodeURIComponent(id)}/pdf`, { headers: auth(cfg) });
      return res.blob();
    },
  };
}

// La conexión se recuerda solo durante la sesión de la pestaña (el token cambia en cada arranque del companion).
const KEY = "kdp.companion";
export function loadCompanionConfig(storage: Pick<Storage, "getItem"> | undefined = safeSession()): CompanionConfig {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? "null") as Partial<CompanionConfig> | null;
    if (v && typeof v.baseUrl === "string" && typeof v.token === "string") return { baseUrl: v.baseUrl, token: v.token };
  } catch {
    // sin almacenamiento: se usan los valores por defecto
  }
  return { baseUrl: DEFAULT_COMPANION_URL, token: "" };
}
export function saveCompanionConfig(cfg: CompanionConfig, storage: Pick<Storage, "setItem"> | undefined = safeSession()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(cfg));
  } catch {
    // la conexión sigue activa en memoria
  }
}
function safeSession(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
