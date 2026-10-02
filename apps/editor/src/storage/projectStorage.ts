import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { CURRENT_SCHEMA_VERSION, loadProject, type LoadError, type Project } from "@free-book-cover/core";

// IndexedDB: documento y blobs de recursos en stores separados (SDD R-06).
interface CoverDB extends DBSchema {
  projects: { key: string; value: { id: string; updatedAt: number; doc: unknown } };
  assets: {
    key: string;
    value: { key: string; projectId: string; assetId: string; blob: Blob };
    indexes: { byProject: string };
  };
  meta: { key: string; value: string };
}

export interface StoredAsset {
  id: string;
  blob: Blob;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; kind: "quota" | "incompatible" | "error"; message: string };

export type LoadStoredResult =
  | { ok: true; project: Project; assets: StoredAsset[] }
  | { ok: false; error: LoadError | { kind: "not_found" } };

export interface ProjectStorage {
  saveProject(doc: Project): Promise<SaveResult>;
  putAsset(projectId: string, assetId: string, blob: Blob): Promise<SaveResult>;
  loadProject(id: string): Promise<LoadStoredResult>;
  loadLastProject(): Promise<LoadStoredResult>;
  listProjects(): Promise<Array<{ id: string; name: string; revision: number; updatedAt: number }>>;
  deleteProject(id: string): Promise<void>;
  close(): void;
}

export const DB_NAME = "kdp-cover-creator";
const LAST_KEY = "lastProjectId";
const assetKey = (projectId: string, assetId: string) => `${projectId}/${assetId}`;

export function isQuotaError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "QuotaExceededError";
}

function failure(e: unknown): SaveResult {
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, kind: isQuotaError(e) ? "quota" : "error", message };
}

export async function openStorage(dbName: string = DB_NAME): Promise<ProjectStorage> {
  const db = await openDB<CoverDB>(dbName, 1, {
    upgrade(d) {
      d.createObjectStore("projects", { keyPath: "id" });
      const assets = d.createObjectStore("assets", { keyPath: "key" });
      assets.createIndex("byProject", "projectId");
      d.createObjectStore("meta");
    },
  });
  return createStorage(db);
}

// Separado de openStorage para poder inyectar una base de datos en las pruebas.
export function createStorage(db: IDBPDatabase<CoverDB>): ProjectStorage {
  async function load(id: string): Promise<LoadStoredResult> {
    const rec = await db.get("projects", id);
    if (!rec) return { ok: false, error: { kind: "not_found" } };
    const r = loadProject(rec.doc);
    if (!r.ok) return r;
    const rows = await db.getAllFromIndex("assets", "byProject", id);
    return { ok: true, project: r.project, assets: rows.map((a) => ({ id: a.assetId, blob: a.blob })) };
  }

  return {
    async saveProject(doc) {
      try {
        const tx = db.transaction(["projects", "meta"], "readwrite");
        const existing = await tx.objectStore("projects").get(doc.id);
        const v = (existing?.doc as { schemaVersion?: unknown } | undefined)?.schemaVersion;
        // Nunca se sobrescribe un proyecto guardado con un esquema posterior.
        if (typeof v === "number" && v > CURRENT_SCHEMA_VERSION) {
          tx.abort();
          await tx.done.catch(() => undefined);
          return { ok: false, kind: "incompatible", message: `esquema ${v} no compatible` };
        }
        await tx.objectStore("projects").put({ id: doc.id, updatedAt: Date.now(), doc: JSON.parse(JSON.stringify(doc)) });
        await tx.objectStore("meta").put(doc.id, LAST_KEY);
        await tx.done;
        return { ok: true };
      } catch (e) {
        return failure(e);
      }
    },
    async putAsset(projectId, assetId, blob) {
      try {
        await db.put("assets", { key: assetKey(projectId, assetId), projectId, assetId, blob });
        return { ok: true };
      } catch (e) {
        return failure(e);
      }
    },
    loadProject: load,
    async loadLastProject() {
      const id = await db.get("meta", LAST_KEY);
      return id ? load(id) : { ok: false, error: { kind: "not_found" } };
    },
    async listProjects() {
      const all = await db.getAll("projects");
      return all.map((r) => {
        const d = r.doc as { name?: string; revision?: number };
        return { id: r.id, name: d.name ?? "", revision: d.revision ?? 0, updatedAt: r.updatedAt };
      });
    },
    async deleteProject(id) {
      const tx = db.transaction(["projects", "assets", "meta"], "readwrite");
      await tx.objectStore("projects").delete(id);
      const keys = await tx.objectStore("assets").index("byProject").getAllKeys(id);
      for (const k of keys) await tx.objectStore("assets").delete(k);
      if ((await tx.objectStore("meta").get(LAST_KEY)) === id) await tx.objectStore("meta").delete(LAST_KEY);
      await tx.done;
    },
    close: () => db.close(),
  };
}
