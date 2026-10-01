import { CURRENT_SCHEMA_VERSION, projectSchema, type Project } from "./project.js";

// Registro versión origen -> función que produce la versión siguiente.
export type Migrations = Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>;

export const migrations: Migrations = {};

export type LoadError =
  | { kind: "invalid"; issues: string[] }
  | { kind: "unsupported_version"; found: unknown; supported: number };

export type LoadResult =
  | { ok: true; project: Project; migrated: boolean }
  | { ok: false; error: LoadError };

export interface LoadOptions {
  migrations?: Migrations;
  currentVersion?: number;
}

// Migra y valida un documento bruto. Nunca modifica la entrada; una versión
// desconocida o superior se rechaza para que el llamador no la sobrescriba.
export function loadProject(raw: unknown, opts: LoadOptions = {}): LoadResult {
  const registry = opts.migrations ?? migrations;
  const current = opts.currentVersion ?? CURRENT_SCHEMA_VERSION;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: { kind: "invalid", issues: ["el documento no es un objeto"] } };
  }
  let doc = structuredClone(raw) as Record<string, unknown>;
  const found = doc.schemaVersion;
  if (!Number.isInteger(found) || (found as number) < 0 || (found as number) > current) {
    return { ok: false, error: { kind: "unsupported_version", found, supported: current } };
  }
  let version = found as number;
  const migrated = version < current;
  while (version < current) {
    const step = registry[version];
    if (!step) return { ok: false, error: { kind: "unsupported_version", found, supported: current } };
    try {
      doc = step(doc);
    } catch (e) {
      return { ok: false, error: { kind: "invalid", issues: [`migración ${version} falló: ${String(e)}`] } };
    }
    version += 1;
    doc.schemaVersion = version;
  }
  const parsed = projectSchema.safeParse(doc);
  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
    };
  }
  return { ok: true, project: parsed.data, migrated };
}

// Serializa para guardar (JSON plano, sin estado de Fabric).
export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}
