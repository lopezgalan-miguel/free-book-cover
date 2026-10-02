import {
  catalogGroup, checkFontsReady, usedFamilies, type Asset, type FontState, type FontsReport, type Project, type TextElement,
} from "@free-book-cover/core";
import type { StoredAsset } from "../storage/projectStorage";

// Entorno de fuentes del navegador, inyectable para poder probar sin DOM.
export interface FontEnv {
  // Registra una fuente subida (FontFace) y espera a que cargue. Lanza si no se puede.
  addFace(family: string, data: ArrayBuffer): Promise<void>;
  // Pide una fuente del catálogo; true si hay una cara definida y cargada.
  loadCatalog(family: string, weight: number, italic: boolean): Promise<boolean>;
  removeFace?(family: string): void;
}

const LOAD_TIMEOUT_MS = 10_000;
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });

export function browserFontEnv(): FontEnv | null {
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) return null;
  const faces = new Map<string, FontFace>();
  return {
    async addFace(family, data) {
      const face = new FontFace(family, data, { weight: "100 900", style: "normal" });
      await withTimeout(face.load(), LOAD_TIMEOUT_MS);
      document.fonts.add(face);
      faces.set(family, face);
    },
    async loadCatalog(family, weight, italic) {
      const loaded = await withTimeout(document.fonts.load(`${italic ? "italic " : ""}${weight} 16px "${family}"`), LOAD_TIMEOUT_MS);
      return loaded.length > 0;
    },
    removeFace(family) {
      const f = faces.get(family);
      if (f) document.fonts.delete(f);
      faces.delete(family);
    },
  };
}

interface Entry {
  state: FontState;
  message?: string;
}

// Estado de carga de cada familia (catálogo y subidas). Las del sistema no pasan por aquí.
export class FontRegistry {
  private upload = new Map<string, Entry>();
  private catalog = new Map<string, Map<string, Entry>>();
  private listeners = new Set<() => void>();
  private _version = 0;

  constructor(private env: FontEnv | null) {}

  get version(): number {
    return this._version;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  private bump() {
    this._version++;
    this.listeners.forEach((l) => l());
  }

  stateOf = (family: string): FontState | undefined => {
    if (catalogGroup(family) === "system") return "loaded";
    const up = this.upload.get(family);
    if (up) return up.state;
    const cat = this.catalog.get(family);
    if (!cat) return undefined;
    const states = [...cat.values()].map((e) => e.state);
    return states.includes("failed") ? "failed" : states.includes("loading") ? "loading" : "loaded";
  };

  failureOf(family: string): string | undefined {
    return this.upload.get(family)?.message;
  }

  hasUpload(family: string): boolean {
    return this.upload.has(family);
  }

  // Pide las fuentes del catálogo que usa el documento (por familia, peso y cursiva).
  ensureDoc(doc: Project): void {
    for (const e of doc.elements) {
      if (e.type !== "text" || !e.visible) continue;
      for (const r of e.runs) if (r.text !== "") this.ensureCatalog(r.fontFamily, r.weight, r.italic);
    }
  }
  // Para la lista de fuentes: pide una muestra del catálogo.
  ensureCatalog(family: string, weight = 400, italic = false): void {
    if (catalogGroup(family) === null || catalogGroup(family) === "system" || this.upload.has(family)) return;
    const key = `${weight}|${italic}`;
    const perFamily = this.catalog.get(family) ?? new Map<string, Entry>();
    this.catalog.set(family, perFamily);
    if (perFamily.has(key)) return;
    if (!this.env) {
      perFamily.set(key, { state: "failed", message: "unsupported" });
      this.bump();
      return;
    }
    perFamily.set(key, { state: "loading" });
    this.bump();
    this.env.loadCatalog(family, weight, italic).then(
      (ok) => this.settle(perFamily, key, ok ? { state: "loaded" } : { state: "failed", message: "no-face" }),
      (e) => this.settle(perFamily, key, { state: "failed", message: String((e as Error)?.message ?? e) }),
    );
  }
  private settle(m: Map<string, Entry>, key: string, e: Entry) {
    m.set(key, e);
    this.bump();
  }

  // Carga una fuente subida. Si falla no se registra nada y se devuelve el motivo.
  async registerUpload(family: string, data: ArrayBuffer): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.env) return { ok: false, message: "unsupported" };
    this.upload.set(family, { state: "loading" });
    this.bump();
    try {
      await this.env.addFace(family, data);
      this.upload.set(family, { state: "loaded" });
      this.bump();
      return { ok: true };
    } catch (e) {
      this.upload.delete(family);
      this.bump();
      return { ok: false, message: String((e as Error)?.message ?? e) };
    }
  }

  forget(family: string): void {
    this.env?.removeFace?.(family);
    this.upload.delete(family);
    this.bump();
  }

  // Al abrir un proyecto: registra las fuentes guardadas; si falta el blob o no carga, queda "failed" (visible).
  async syncAssets(assets: readonly Asset[], stored: readonly StoredAsset[]): Promise<void> {
    await Promise.all(
      assets.filter((a) => a.kind === "font" && typeof a.metadata.family === "string").map(async (a) => {
        const family = a.metadata.family as string;
        const known = this.upload.get(family);
        if (known && known.state !== "failed") return;
        const blob = stored.find((s) => s.id === a.id)?.blob;
        if (!blob) {
          this.upload.set(family, { state: "failed", message: "missing-blob" });
          this.bump();
          return;
        }
        if (!this.env) {
          this.upload.set(family, { state: "failed", message: "unsupported" });
          this.bump();
          return;
        }
        this.upload.set(family, { state: "loading" });
        this.bump();
        try {
          await this.env.addFace(family, await blob.arrayBuffer());
          this.upload.set(family, { state: "loaded" });
        } catch (e) {
          this.upload.set(family, { state: "failed", message: String((e as Error)?.message ?? e) });
        }
        this.bump();
      }),
    );
  }

  // Para la exportación (pasos 5 y 7): bloquea la sustitución silenciosa de fuentes.
  // Sin efectos: quien exporte llama antes a ensureDoc y espera a que no queden fuentes "loading".
  checkFontsReady(doc: Project): FontsReport {
    return checkFontsReady(doc, this.stateOf);
  }
}

export const familiesInUse = (el: TextElement): string[] => [...new Set(el.runs.filter((r) => r.text !== "").map((r) => r.fontFamily))];
export { usedFamilies };

let shared: FontRegistry | null = null;
export function getFontRegistry(): FontRegistry {
  return (shared ??= new FontRegistry(browserFontEnv()));
}
