import {
  FONT_CATALOG, MCP_TOOLS, TEXT_STYLE_KEYS, documentFontFamilies, importAssetEditorInput,
  type CommandError, type ElementSummary, type Project, type TextElement, type TextMeasure, type ToolError, type ToolOutcome, type McpToolName,
} from "@free-book-cover/core";
import { textHeightIn } from "../canvas/measure";
import { importImage, type ThumbnailMaker } from "../images/importImage";
import type { EditorStore } from "../store/editorStore";

export interface ExecutorDeps {
  store: EditorStore;
  /** Proyecto que el usuario ha autorizado, o null. */
  authorizedProjectId(): string | null;
  /** Medidor de texto para dimensionar la caja; sin él se estima por el interlineado. */
  measure(): TextMeasure | null;
  makeThumbnail?: ThumbnailMaker;
}

const fail = (error: ToolError): ToolOutcome => ({ ok: false, error });
const invalid = (...issues: string[]) => fail({ kind: "invalid_params", issues });
const NOT_AUTHORIZED: ToolError = { kind: "editor_disconnected", reason: "not_authorized" };

const issuesOf = (e: { issues: readonly { path: PropertyKey[]; message: string }[] }): string[] =>
  e.issues.map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`);

// Tipificación de los errores de core; resource solo se conoce en los puntos que lo comprueban antes.
function fromCommand(error: CommandError, resource: "element" | "asset"): ToolError {
  if (error.kind === "conflict") return { kind: "conflict", expectedRevision: error.expectedRevision, actualRevision: error.actualRevision };
  if (error.kind === "not_found") return { kind: "not_found", resource, id: error.id };
  return { kind: "invalid_params", issues: error.issues };
}

export function summarize(doc: Project): ElementSummary[] {
  return doc.elements.map((e): ElementSummary => {
    const base = { id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, rotation: e.rotation, zIndex: e.zIndex, visible: e.visible };
    if (e.type === "text") {
      const r = e.runs[0];
      return { ...base, text: e.runs.map((x) => x.text).join(""), ...(r ? { fontFamily: r.fontFamily, fontSizePt: r.fontSizePt, color: r.color } : {}) };
    }
    if (e.type === "image") return { ...base, assetId: e.assetRef.assetId };
    return { ...base, fill: e.fill };
  });
}

const fontKnown = (doc: Project, family: string) => FONT_CATALOG.some((g) => g.names.includes(family)) || documentFontFamilies(doc).has(family);

const bytesFromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Altura de la caja de un texto: la maquetación real si hay medidor; si no, una estimación por interlineado.
function textHeight(deps: ExecutorDeps, el: TextElement): number {
  const m = deps.measure();
  if (m) return textHeightIn(el, m);
  const pt = Math.max(...el.runs.map((r) => r.fontSizePt), 1);
  return Math.max(0.1, (pt * el.lineHeight) / 72);
}

async function saved(store: EditorStore): Promise<boolean> {
  try {
    return await store.save();
  } catch {
    return false;
  }
}

/**
 * Ejecuta una herramienta MCP en el editor. Toda mutación pasa por applyCommand de core con la revisión
 * esperada (atómica: o se aplica entera o no cambia nada) y por el historial, de modo que se puede deshacer.
 */
export async function executeTool(deps: ExecutorDeps, tool: McpToolName, rawArgs: unknown): Promise<ToolOutcome> {
  const { store } = deps;
  const authorized = deps.authorizedProjectId();
  const doc = () => store.getState().history.present;
  const schema = tool === "import_asset" ? importAssetEditorInput : MCP_TOOLS[tool].input;
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) return invalid(...issuesOf(parsed.error));
  const args = parsed.data as Record<string, any>;
  // El editor comprueba por su cuenta la autorización: no confía solo en el companion.
  if (authorized === null || doc().id !== authorized || (args.projectId !== undefined && args.projectId !== authorized)) return fail(NOT_AUTHORIZED);

  switch (tool) {
    case "get_canvas_state": {
      const d = doc();
      const assets = d.assets.map((a) => ({
        id: a.id, kind: a.kind, mimeType: a.mimeType,
        ...(typeof a.metadata.widthPx === "number" ? { widthPx: a.metadata.widthPx } : {}),
        ...(typeof a.metadata.heightPx === "number" ? { heightPx: a.metadata.heightPx } : {}),
        ...(typeof a.metadata.sizeBytes === "number" ? { sizeBytes: a.metadata.sizeBytes } : {}),
      }));
      return {
        ok: true,
        data: {
          projectId: d.id, name: d.name, mode: d.mode, revision: d.revision,
          canvas: { widthIn: d.canvas.widthIn, heightIn: d.canvas.heightIn, background: d.canvas.background, fit: d.canvas.backgroundFit ?? "cover" },
          elements: summarize(d), assets,
        },
      };
    }

    case "add_text_element": {
      const d = doc();
      const family = args.fontFamily ?? "Lora";
      if (!fontKnown(d, family)) return invalid(`fontFamily: la fuente «${family}» no está en el catálogo ni en el proyecto`);
      const width = args.width ?? d.canvas.widthIn / 2;
      const draft: TextElement = {
        id: store.newId(), type: "text", x: args.x ?? (d.canvas.widthIn - width) / 2, y: args.y ?? d.canvas.heightIn * 0.65, width, height: 1,
        rotation: 0, zIndex: 0, visible: true,
        runs: [{
          text: args.text, fontFamily: family, fontSizePt: args.fontSizePt ?? 36, weight: args.weight ?? 500, italic: args.italic ?? false,
          underline: args.underline ?? false, uppercase: args.uppercase ?? false, color: args.color ?? "#f4efe6",
        }],
        align: args.align ?? "center", lineHeight: args.lineHeight ?? 1.2, letterSpacing: args.letterSpacing ?? 0.02,
        shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
      };
      const r = store.applyRemote({ type: "addElement", element: { ...draft, height: textHeight(deps, draft) } }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { elementId: draft.id, revision: r.revision, saved: await saved(store) } };
    }

    case "update_element_style": {
      if (args.expectedRevision !== doc().revision) return fail({ kind: "conflict", expectedRevision: args.expectedRevision, actualRevision: doc().revision });
      const el = doc().elements.find((e) => e.id === args.elementId);
      if (!el) return fail({ kind: "not_found", resource: "element", id: args.elementId });
      const style = args.style as Record<string, unknown>;
      const textOnly = [...TEXT_STYLE_KEYS, "shadow", "outline", "curvature"];
      const allowed = new Set(["x", "y", "width", "height", "rotation", "visible", ...(el.type === "text" ? textOnly : el.type === "shape" ? ["fill", "stroke"] : ["fit"])]);
      const wrong = Object.keys(style).filter((k) => style[k] !== undefined && !allowed.has(k));
      if (wrong.length) return invalid(...wrong.map((k) => `style.${k}: no aplicable a un elemento de tipo ${el.type}`));
      let patch: Record<string, unknown> = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined));
      if (el.type === "text") {
        const runKeys = ["fontFamily", "fontSizePt", "weight", "italic", "underline", "uppercase", "color"];
        const family = style.fontFamily;
        if (typeof family === "string" && !fontKnown(doc(), family)) return invalid(`style.fontFamily: la fuente «${family}» no está en el catálogo ni en el proyecto`);
        const runPatch = Object.fromEntries(runKeys.filter((k) => style[k] !== undefined).map((k) => [k, style[k]]));
        patch = Object.fromEntries(Object.entries(patch).filter(([k]) => !runKeys.includes(k)));
        if (Object.keys(runPatch).length) patch.runs = el.runs.map((r) => ({ ...r, ...runPatch }));
        // La caja sigue al texto salvo que el cliente fije la altura.
        if (style.height === undefined && ["fontFamily", "fontSizePt", "weight", "italic", "uppercase", "lineHeight", "letterSpacing", "width", "curvature"].some((k) => style[k] !== undefined)) {
          patch.height = textHeight(deps, { ...el, ...patch } as TextElement);
        }
      }
      const r = store.applyRemote({ type: "updateElement", id: el.id, props: patch as never }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      const updated = summarize(doc()).find((e) => e.id === el.id)!;
      return { ok: true, data: { element: updated, revision: r.revision, saved: await saved(store) } };
    }

    case "import_asset": {
      if (args.expectedRevision !== undefined && args.expectedRevision !== doc().revision) {
        return fail({ kind: "conflict", expectedRevision: args.expectedRevision, actualRevision: doc().revision });
      }
      let bytes: Uint8Array;
      try {
        bytes = bytesFromBase64(args.dataBase64);
      } catch {
        return invalid("dataBase64: no es base64 válido");
      }
      // La decodificación no es instantánea: una edición intermedia debe dar conflicto, no importar.
      if (args.expectedRevision !== undefined && args.expectedRevision !== doc().revision) {
        return fail({ kind: "conflict", expectedRevision: args.expectedRevision, actualRevision: doc().revision });
      }
      const file = new File([bytes as BlobPart], args.name ?? "imagen", {});
      const before = store.getState().error;
      const r = await importImage(store, file, "asset", deps.makeThumbnail, args.expectedRevision);
      if (!r.ok) {
        // Una edición durante la importación: conflicto, sin recurso huérfano (addAsset lo retira).
        if (args.expectedRevision !== undefined && args.expectedRevision !== doc().revision) {
          return fail({ kind: "conflict", expectedRevision: args.expectedRevision, actualRevision: doc().revision });
        }
        if (r.reason === "unsupported") return invalid("formato de imagen no admitido (PNG, JPEG, WebP o GIF)");
        const err = store.getState().error;
        if (r.reason === "limit" && err !== before && err?.kind === "limit") return invalid(`la imagen supera un límite del proyecto (${err.error.kind})`);
        return fail(r.reason === "limit" ? { kind: "invalid_params", issues: ["la imagen no se pudo guardar en el proyecto"] } : { kind: "internal" });
      }
      const asset = doc().assets.find((a) => a.id === r.assetId);
      const m = asset?.metadata ?? {};
      if (!asset || typeof m.widthPx !== "number" || typeof m.heightPx !== "number") return fail({ kind: "internal" });
      return {
        ok: true,
        data: { assetId: asset.id, revision: doc().revision, mimeType: asset.mimeType, widthPx: m.widthPx, heightPx: m.heightPx, sizeBytes: typeof m.sizeBytes === "number" ? m.sizeBytes : bytes.length, saved: await saved(store) },
      };
    }

    case "apply_background": {
      const d = doc();
      if (args.assetId !== undefined) {
        const a = d.assets.find((x) => x.id === args.assetId);
        if (d.revision !== args.expectedRevision) return fail({ kind: "conflict", expectedRevision: args.expectedRevision, actualRevision: d.revision });
        if (!a || a.kind !== "image") return fail({ kind: "not_found", resource: "asset", id: args.assetId });
      }
      if (args.color !== undefined && args.fit !== undefined) return invalid("fit: solo se aplica a un fondo con assetId");
      const background = args.assetId !== undefined ? { assetId: args.assetId as string } : (args.color as string);
      const r = store.applyRemote({ type: "setBackground", background, ...(args.assetId !== undefined && args.fit !== undefined ? { fit: args.fit } : {}) }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "asset"));
      const now = doc();
      return { ok: true, data: { revision: r.revision, background: now.canvas.background, fit: now.canvas.backgroundFit ?? "cover", saved: await saved(store) } };
    }
  }
}
