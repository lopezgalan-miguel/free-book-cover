import { describe, expect, it } from "vitest";
import { ca, dictionaries, es } from "../src/i18n/dictionaries";
import { LANG_STORAGE_KEY, readStoredLang, storeLang, translate } from "../src/i18n";

describe("diccionarios", () => {
  it("es y ca tienen las mismas claves y ninguna vacía", () => {
    expect(Object.keys(ca).sort()).toEqual(Object.keys(es).sort());
    for (const d of Object.values(dictionaries)) for (const v of Object.values(d)) expect(v.trim()).not.toBe("");
  });
  it("conservan los textos del mockup", () => {
    expect(es.exportBtn).toBe("Exportar");
    expect(ca.exportBtn).toBe("Exporta");
    expect(es.layers).toBe("Capas de texto");
    expect(ca.layers).toBe("Capes de text");
    expect(ca.exInfo).toContain("S'exporta");
  });
  it("interpola variables", () => {
    expect(translate("es", "backupParts", { n: 3 })).toBe("Copia dividida en 3 partes.");
    expect(translate("ca", "backupParts", { n: 3 })).toBe("Còpia dividida en 3 parts.");
  });
});

describe("idioma persistido", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("por defecto es; guarda y recupera ca", () => {
    const s = mem();
    expect(readStoredLang(s)).toBe("es");
    storeLang("ca", s);
    expect(s.getItem(LANG_STORAGE_KEY)).toBe("ca");
    expect(readStoredLang(s)).toBe("ca");
  });
  it("ignora valores inválidos y tolera almacenamiento que lanza", () => {
    expect(readStoredLang({ getItem: () => "fr" })).toBe("es");
    const boom = { getItem: () => { throw new Error("denegado"); }, setItem: () => { throw new Error("denegado"); } };
    expect(readStoredLang(boom)).toBe("es");
    expect(() => storeLang("ca", boom)).not.toThrow();
    expect(readStoredLang(undefined)).toBe("es");
  });
});
