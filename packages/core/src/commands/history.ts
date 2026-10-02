import { applyCommand, type Command, type CommandError } from "./commands.js";
import type { Project } from "../schema/project.js";

// Historial por instantáneas del documento. Elegido frente a comandos inversos
// porque el documento es JSON pequeño (los blobs viven fuera, en assets), cada
// comando ya valida el resultado y no hay que mantener inversos por tipo. La
// pila se acota con `limit`. Las revisiones son monótonas: deshacer/rehacer
// restauran el contenido pero estampan revision + 1, de modo que una edición
// externa (MCP) con una revisión anterior siga detectándose como conflicto.
export interface History {
  readonly past: readonly Project[];
  readonly present: Project;
  readonly future: readonly Project[];
  readonly limit: number;
  // Último paso fusionable (gesto continuo): clave y marca de tiempo. Deshacer/rehacer y cualquier
  // otro comando lo anulan.
  readonly merge?: { readonly key: string; readonly at: number };
}

// Fusión de comandos consecutivos de un mismo gesto (teclas, selector de color) en un único paso.
export interface MergeOptions {
  key: string;
  at: number;
  windowMs?: number;
}
export const DEFAULT_MERGE_WINDOW_MS = 1000;

export type HistoryResult = { ok: true; history: History } | { ok: false; error: CommandError };

export const DEFAULT_HISTORY_LIMIT = 100;

export function createHistory(doc: Project, limit: number = DEFAULT_HISTORY_LIMIT): History {
  return { past: [], present: doc, future: [], limit: Math.max(1, Math.floor(limit)) };
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;

export function execute(h: History, cmd: Command, expectedRevision: number, merge?: MergeOptions): HistoryResult {
  const r = applyCommand(h.present, cmd, expectedRevision);
  if (!r.ok) return r;
  const mark = merge ? { merge: { key: merge.key, at: merge.at } } : {};
  const window = merge?.windowMs ?? DEFAULT_MERGE_WINDOW_MS;
  // Mismo gesto: el documento candidato ya está validado; el paso anterior del historial se conserva.
  if (merge && h.merge && h.merge.key === merge.key && h.past.length > 0 && merge.at - h.merge.at <= window) {
    return { ok: true, history: { past: h.past, present: r.doc, future: [], limit: h.limit, ...mark } };
  }
  const past = [...h.past, h.present].slice(-h.limit);
  return { ok: true, history: { past, present: r.doc, future: [], limit: h.limit, ...mark } };
}

// Cierra el gesto en curso: el siguiente comando abre un paso nuevo.
export function endMerge(h: History): History {
  if (!h.merge) return h;
  const { merge: _m, ...rest } = h;
  return rest;
}

function conflict(h: History, expected: number | undefined): HistoryResult | null {
  if (expected !== undefined && expected !== h.present.revision) {
    return { ok: false, error: { kind: "conflict", expectedRevision: expected, actualRevision: h.present.revision } };
  }
  return null;
}

export function undo(h: History, expectedRevision?: number): HistoryResult {
  const c = conflict(h, expectedRevision);
  if (c) return c;
  const prev = h.past[h.past.length - 1];
  if (!prev) return { ok: false, error: { kind: "not_found", id: "undo" } };
  const present = { ...prev, revision: h.present.revision + 1 };
  return { ok: true, history: { past: h.past.slice(0, -1), present, future: [h.present, ...h.future], limit: h.limit } };
}

export function redo(h: History, expectedRevision?: number): HistoryResult {
  const c = conflict(h, expectedRevision);
  if (c) return c;
  const next = h.future[0];
  if (!next) return { ok: false, error: { kind: "not_found", id: "redo" } };
  const present = { ...next, revision: h.present.revision + 1 };
  return { ok: true, history: { past: [...h.past, h.present], present, future: h.future.slice(1), limit: h.limit } };
}
