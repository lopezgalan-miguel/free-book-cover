import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { dictionaries, LANGS, type DictKey, type Lang } from "./dictionaries";

export const LANG_STORAGE_KEY = "kdp.lang";

export function readStoredLang(storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage()): Lang {
  try {
    const v = storage?.getItem(LANG_STORAGE_KEY);
    if ((LANGS as readonly string[]).includes(v ?? "")) return v as Lang;
  } catch {
    // almacenamiento no disponible: se usa el idioma por defecto
  }
  return "es";
}

export function storeLang(lang: Lang, storage: Pick<Storage, "setItem"> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // sin persistencia; la interfaz sigue funcionando
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function translate(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  let s: string = dictionaries[lang][key];
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storeLang(l);
  }, []);
  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n fuera de I18nProvider");
  return v;
}
