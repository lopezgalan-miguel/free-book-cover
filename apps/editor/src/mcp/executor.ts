import {
  DEFAULT_EXPORT_QUALITY, DEFAULT_PX_PER_IN, FONT_CATALOG, availableFaces, availableWeights, hasFace, MAX_EXPORT_BYTES, MCP_TOOLS, assetDims, customTarget, defaultTextElement, documentFontFamilies,
  editableKeys, elementVisibility, findPreset, readFontAxes, importAssetEditorInput, importFontEditorInput, isResolvedTarget, kdpLayout, letterWidthPatch, lowDpiForSetup, needsRelayout, overridesOf,
  normalizeRuns, TEXT_RUN_KEYS, styleToPatch, targetFromPreset, validatePrintSetup, variantDocument, visibleArea,
  type CommandError, type ElementSummary, type PrintSetup, type Project, type RunInput, type ResolvedTarget, type TextElement, type TextMeasure, type ToolError, type ToolOutcome, type McpToolName,
} from "@free-book-cover/core";
import { textHeightIn } from "../canvas/measure";
import { runPdfExport, type PdfExportDeps } from "../export/exportPdf";
import { reportText } from "../export/pdfReportText";
import { readStoredLang, translate } from "../i18n";
import { runExport, type ExportDeps } from "../export/exportImage";
import type { FontRegistry } from "../fonts/fontRegistry";
import { importFont } from "../fonts/importFont";
import { importImage, type ThumbnailMaker } from "../images/importImage";
import { generateTextureAsset, type PngEncoder } from "../images/generateTexture";
import type { ExecutorPort } from "../store/ports";

export interface ExecutorDeps {
  store: ExecutorPort;
  /** Proyecto que el usuario ha autorizado, o null. */
  authorizedProjectId(): string | null;
  /** Medidor de texto para dimensionar la caja; sin él se estima por el interlineado. */
  measure(): TextMeasure | null;
  makeThumbnail?: ThumbnailMaker;
  /** Registro de fuentes del editor (import_font). */
  fonts?: FontRegistry;
  /** Dependencias de exportación del navegador (export_image). */
  exportDeps?: () => ExportDeps;
  /** Dependencias del PDF de KDP (export_kdp_pdf): renderer, cliente del companion de preimpresión y su configuración. */
  pdfDeps?: () => PdfExportDeps;
  /** Codificador PNG de las texturas generadas (generate_texture); por defecto, el del navegador. */
  encodePng?: PngEncoder;
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
      return {
        ...base, text: e.runs.map((x) => x.text).join(""), ...(r ? { fontFamily: r.fontFamily, fontSizePt: r.fontSizePt, color: r.color } : {}),
        ...(e.runs.length > 1 ? { runs: e.runs.map((x) => ({ text: x.text, fontFamily: x.fontFamily, fontSizePt: x.fontSizePt, weight: x.weight, italic: x.italic, color: x.color })) } : {}),
      };
    }
    if (e.type === "image") return { ...base, assetId: e.assetRef.assetId };
    return { ...base, fill: e.fill };
  });
}

// Una cara que la familia no publica fallaría al exportar (no se sintetiza): se rechaza al crearla.
function missingFace(doc: Project, el: TextElement): string | null {
  const own = documentFontFamilies(doc);
  for (const r of el.runs) {
    if (r.text === "" || hasFace(r.fontFamily, r.weight, r.italic, own)) continue;
    const faces = (availableFaces(r.fontFamily, own) ?? []).map((f) => `${f.weight}${f.italic ? " cursiva" : ""}`).join(", ");
    return `la fuente «${r.fontFamily}» no tiene la cara ${r.weight}${r.italic ? " cursiva" : ""} (disponibles: ${faces || "ninguna"})`;
  }
  return null;
}

const NO_COMPANION_MSG = "conecta el editor al companion de preimpresión (panel MCP o diálogo de exportación)";
const DEFAULT_WEIGHT = 500;
function nearestWeight(doc: Project, family: string, italic: boolean): number {
  const ws = availableWeights(family, italic, documentFontFamilies(doc));
  return ws.length ? ws.reduce((b, w) => (Math.abs(w - DEFAULT_WEIGHT) < Math.abs(b - DEFAULT_WEIGHT) ? w : b)) : DEFAULT_WEIGHT;
}

type Run = TextElement["runs"][number];
// Fragmento desde sus valores por defecto. Sin peso propio ni del estilo: el del fragmento de partida si la cara no cambia; si no, el publicado más próximo.
function buildRun(doc: Project, defaults: Run, own: Omit<RunInput, "text">, text: string, styleWeight?: number, from?: Run): Run {
  const base = { ...defaults, ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)), text } as Run;
  const sameFace = from && from.fontFamily === base.fontFamily && from.italic === base.italic;
  return { ...base, weight: own.weight ?? styleWeight ?? (sameFace ? from.weight : nearestWeight(doc, base.fontFamily, base.italic)) };
}

const fontKnown = (doc: Project, family: string) => FONT_CATALOG.some((g) => g.names.includes(family)) || documentFontFamilies(doc).has(family);

const bytesFromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function base64FromBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const conflict = (expected: number, actual: number): ToolOutcome => fail({ kind: "conflict", expectedRevision: expected, actualRevision: actual });
const variantOf = (d: Project, id: string): ResolvedTarget | undefined => d.digitalTargets?.find((t): t is ResolvedTarget => isResolvedTarget(t) && t.id === id);
const imageAsset = (d: Project, id: string) => d.assets.find((a) => a.id === id && a.kind === "image");

// Altura de la caja de un texto: la maquetación real si hay medidor; si no, una estimación por interlineado.
function textHeight(deps: ExecutorDeps, el: TextElement): number {
  const m = deps.measure();
  if (m) return textHeightIn(el, m);
  const pt = Math.max(...el.runs.map((r) => r.fontSizePt), 1);
  return Math.max(0.1, (pt * el.lineHeight) / 72);
}

async function saved(store: Pick<ExecutorPort, "save">): Promise<boolean> {
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
  const schema = tool === "import_asset" ? importAssetEditorInput : tool === "import_font" ? importFontEditorInput : MCP_TOOLS[tool].input;
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
        ...(a.kind === "font" && typeof a.metadata.family === "string" ? { family: a.metadata.family } : {}),
      }));
      const variants = (d.digitalTargets ?? []).filter(isResolvedTarget).map((t) => ({ id: t.id, name: t.name ?? t.presetId, presetId: t.presetId, widthPx: t.widthPx, heightPx: t.heightPx }));
      const p = d.printSetup;
      return {
        ok: true,
        data: {
          projectId: d.id, name: d.name, mode: d.mode, revision: d.revision,
          canvas: { widthIn: d.canvas.widthIn, heightIn: d.canvas.heightIn, background: d.canvas.background, fit: d.canvas.backgroundFit ?? "cover" },
          elements: summarize(d), assets,
          ...(p ? { printSetup: { trimWidthIn: p.trimWidthIn, trimHeightIn: p.trimHeightIn, pageCount: p.pageCount, paperAndInk: p.paperAndInk } } : {}),
          ...(variants.length ? { variants } : {}),
        },
      };
    }

    case "add_text_element": {
      const d = doc();
      const family = args.fontFamily ?? "Lora";
      if (!fontKnown(d, family)) return invalid(`fontFamily: la fuente «${family}» no está en el catálogo ni en el proyecto`);
      if ((args.text === undefined) === (args.runs === undefined)) return invalid("indica exactamente uno de text o runs");
      for (const [i, r] of (args.runs ?? []).entries()) {
        if (r.fontFamily !== undefined && !fontKnown(d, r.fontFamily)) return invalid(`runs.${i}.fontFamily: la fuente «${r.fontFamily}» no está en el catálogo ni en el proyecto`);
      }
      const draft = defaultTextElement({
        id: store.newId(), text: args.text ?? "", canvas: d.canvas, x: args.x, y: args.y, width: args.width,
        // Sin peso: el publicado más próximo al de por defecto, en el estilo pedido.
        style: { ...args, fontFamily: family, weight: args.weight ?? nearestWeight(d, family, args.italic ?? false) },
      });
      if (args.runs) {
        const [first] = draft.runs;
        draft.runs = normalizeRuns((args.runs as RunInput[]).map(({ text, ...own }) => buildRun(d, first!, own, text, args.weight)), first);
      }
      const face = missingFace(d, draft);
      if (face) return invalid(face);
      const r = store.applyRemote({ type: "addElement", element: { ...draft, height: textHeight(deps, draft) } }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { elementId: draft.id, revision: r.revision, saved: await saved(store) } };
    }

    case "update_element_style": {
      if (args.expectedRevision !== doc().revision) return fail({ kind: "conflict", expectedRevision: args.expectedRevision, actualRevision: doc().revision });
      const el = doc().elements.find((e) => e.id === args.elementId);
      if (!el) return fail({ kind: "not_found", resource: "element", id: args.elementId });
      const style = args.style as Record<string, unknown>;
      const allowed = editableKeys(el.type);
      const wrong = Object.keys(style).filter((k) => style[k] !== undefined && !allowed.has(k));
      if (wrong.length) return invalid(...wrong.map((k) => `style.${k}: no aplicable a un elemento de tipo ${el.type}`));
      const family = style.fontFamily;
      if (el.type === "text" && typeof family === "string" && !fontKnown(doc(), family)) return invalid(`style.fontFamily: la fuente «${family}» no está en el catálogo ni en el proyecto`);
      const newRuns = el.type === "text" ? args.style.runs : undefined;
      for (const [i, r] of (newRuns ?? []).entries()) {
        if (r.fontFamily !== undefined && !fontKnown(doc(), r.fontFamily)) return invalid(`style.runs.${i}.fontFamily: la fuente «${r.fontFamily}» no está en el catálogo ni en el proyecto`);
      }
      for (const key of ["texture", "mask"] as const) {
        const ref = style[key] as { assetId: string } | null | undefined;
        if (ref && !imageAsset(doc(), ref.assetId)) return fail({ kind: "not_found", resource: "asset", id: ref.assetId });
      }
      const { runs: _r, ...rest } = style;
      const patch = styleToPatch(el, rest);
      if (newRuns && el.type === "text") {
        const [first] = el.runs;
        const defaults = { ...first, ...Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== undefined && TEXT_RUN_KEYS.includes(k))) };
        patch.runs = normalizeRuns(newRuns.map(({ text, ...own }: RunInput) => buildRun(doc(), defaults as Run, own, text, rest.weight as number | undefined, first)), first);
      }
      // null quita textura, máscara, sombra interior o filtros: updateElement elimina las claves con valor undefined.
      for (const key of ["texture", "mask", "innerShadow", "filters"]) if (style[key] === null) patch[key] = undefined;
      // La anchura es de una fuente variable concreta: null la quita, y cambiar de familia sin indicarla también.
      if (el.type === "text" && (style.stretch === null || (style.fontFamily !== undefined && style.stretch === undefined))) {
        patch.runs = ((patch.runs as TextElement["runs"] | undefined) ?? el.runs).map(({ stretch: _s, ...r }) => r);
      }
      if (el.type === "text") {
        const next = { ...el, ...patch } as TextElement;
        const face = missingFace(doc(), next);
        if (face) return invalid(`style: ${face}`);
        const own = documentFontFamilies(doc());
        const notUploaded = next.runs.find((r) => r.stretch !== undefined && !own.has(r.fontFamily));
        if (notUploaded) return invalid(`style.stretch: solo se aplica a una fuente variable subida al proyecto («${notUploaded.fontFamily}» no lo es)`);
      }
      // La anchura de letra no reparte las líneas de nuevo: la caja se ensancha con ella, salvo que el cliente fije width o x.
      if (el.type === "text" && typeof style.scaleX === "number" && style.width === undefined && style.x === undefined) {
        Object.assign(patch, letterWidthPatch({ ...el, align: (style.align as TextElement["align"] | undefined) ?? el.align }, style.scaleX));
      }
      // La caja sigue al texto salvo que el cliente fije la altura.
      if (el.type === "text" && style.height === undefined && (needsRelayout(style) || newRuns !== undefined)) {
        patch.height = textHeight(deps, { ...el, ...patch } as TextElement);
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
      if (args.color !== undefined && args.filters !== undefined) return invalid("filters: solo se aplica a un fondo con assetId");
      const background = args.assetId !== undefined ? { assetId: args.assetId as string } : (args.color as string);
      const r = store.applyRemote({
        type: "setBackground", background,
        ...(args.assetId !== undefined && args.fit !== undefined ? { fit: args.fit } : {}),
        ...(args.filters !== undefined ? { filters: args.filters } : {}),
      }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "asset"));
      const now = doc();
      return { ok: true, data: { revision: r.revision, background: now.canvas.background, fit: now.canvas.backgroundFit ?? "cover", saved: await saved(store) } };
    }

    case "import_font": {
      if (!deps.fonts) return fail({ kind: "internal" });
      if (args.expectedRevision !== undefined && args.expectedRevision !== doc().revision) return conflict(args.expectedRevision, doc().revision);
      let bytes: Uint8Array;
      try {
        bytes = bytesFromBase64(args.dataBase64);
      } catch {
        return invalid("dataBase64: no es base64 válido");
      }
      const r = await importFont(store, deps.fonts, new File([bytes as BlobPart], args.name, {}));
      if (!r.ok) {
        if (r.reason === "unsupported") return invalid("formato de fuente no admitido (.ttf, .otf o .woff2)");
        if (r.reason === "load") return invalid("el navegador no pudo cargar la fuente");
        if (r.reason === "limit") return invalid("la fuente supera un límite del proyecto");
        return fail({ kind: "internal" });
      }
      return { ok: true, data: { assetId: r.assetId, family: r.family, revision: doc().revision, sizeBytes: bytes.length, axes: readFontAxes(bytes), saved: await saved(store) } };
    }

    case "set_background_filters": {
      const r = store.applyRemote({ type: "setBackgroundFilters", filters: args.filters }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "asset"));
      return { ok: true, data: { revision: r.revision, filters: doc().canvas.backgroundFilters ?? null, saved: await saved(store) } };
    }

    case "rename_project": {
      const r = store.applyRemote({ type: "setName", name: args.name }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { revision: r.revision, name: doc().name, saved: await saved(store) } };
    }

    case "remove_element": {
      const r = store.applyRemote({ type: "removeElement", id: args.elementId }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { revision: r.revision, saved: await saved(store) } };
    }

    case "reorder_element": {
      const r = store.applyRemote({ type: "reorderElement", id: args.elementId, toIndex: args.toIndex }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      const order = [...doc().elements].sort((a, b) => a.zIndex - b.zIndex).map((e) => e.id);
      return { ok: true, data: { revision: r.revision, order, saved: await saved(store) } };
    }

    case "generate_texture": {
      if (args.expectedRevision !== undefined && args.expectedRevision !== doc().revision) return conflict(args.expectedRevision, doc().revision);
      const { projectId: _p, expectedRevision, ...opts } = args;
      const r = await generateTextureAsset(store, opts as never, { ...(deps.encodePng ? { encode: deps.encodePng } : {}), ...(deps.makeThumbnail ? { makeThumbnail: deps.makeThumbnail } : {}) }, expectedRevision);
      if (!r.ok) {
        if (expectedRevision !== undefined && expectedRevision !== doc().revision) return conflict(expectedRevision, doc().revision);
        return r.reason === "limit" ? invalid("la textura supera un límite del proyecto") : fail({ kind: "internal" });
      }
      const m = doc().assets.find((a) => a.id === r.assetId)?.metadata ?? {};
      return { ok: true, data: { assetId: r.assetId, widthPx: m.widthPx, heightPx: m.heightPx, revision: doc().revision, saved: await saved(store) } };
    }

    case "add_image_element": {
      const d = doc();
      if (args.expectedRevision !== d.revision) return conflict(args.expectedRevision, d.revision);
      const asset = imageAsset(d, args.assetId);
      const dims = assetDims(asset);
      if (!asset || !dims) return fail({ kind: "not_found", resource: "asset", id: args.assetId });
      // Sin caja: la proporción de la imagen, hasta el 80 % del lienzo y centrada (como al subirla en Capas).
      const k = Math.min((d.canvas.widthIn * 0.8) / dims.widthPx, (d.canvas.heightIn * 0.8) / dims.heightPx);
      const width = args.width ?? dims.widthPx * k;
      const height = args.height ?? dims.heightPx * k;
      const element = {
        id: store.newId(), type: "image" as const, x: args.x ?? (d.canvas.widthIn - width) / 2, y: args.y ?? (d.canvas.heightIn - height) / 2, width, height,
        rotation: args.rotation ?? 0, zIndex: 0, visible: true, assetRef: { assetId: asset.id },
        crop: args.crop ?? { x: 0, y: 0, width: 1, height: 1 }, fit: args.fit ?? "cover",
      };
      const r = store.applyRemote({ type: "addElement", element }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { elementId: element.id, revision: r.revision, saved: await saved(store) } };
    }

    case "add_shape_element": {
      const element = {
        id: store.newId(), type: "shape" as const, shape: args.shape, x: args.x, y: args.y, width: args.width, height: args.height,
        rotation: args.rotation ?? 0, zIndex: 0, visible: true, fill: args.fill, ...(args.stroke ? { stroke: args.stroke } : {}),
      };
      const r = store.applyRemote({ type: "addElement", element }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { elementId: element.id, revision: r.revision, saved: await saved(store) } };
    }

    case "add_variant": {
      const id = store.newId();
      let target: ResolvedTarget;
      if (args.presetId === "custom") {
        const c = customTarget(id, args.widthPx, args.heightPx, args.name);
        if (!c.ok) return invalid("widthPx/heightPx: tamaño no válido");
        target = c.target;
      } else {
        target = { ...targetFromPreset(findPreset(args.presetId)!, id), ...(args.name ? { name: args.name } : {}) };
      }
      const r = store.applyRemote({ type: "addDigitalTarget", target }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      return { ok: true, data: { targetId: id, widthPx: target.widthPx, heightPx: target.heightPx, revision: r.revision, saved: await saved(store) } };
    }

    case "update_variant": {
      const d = doc();
      if (args.expectedRevision !== d.revision) return conflict(args.expectedRevision, d.revision);
      if (!variantOf(d, args.targetId)) return fail({ kind: "not_found", resource: "variant", id: args.targetId });
      const r = store.applyRemote({ type: "updateVariant", targetId: args.targetId, view: args.view, background: args.background, elements: args.elements }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      const now = doc();
      const t = variantOf(now, args.targetId)!;
      const notInside = elementVisibility(variantDocument(now, t)).filter((v) => v.visibility !== "inside");
      return { ok: true, data: { targetId: t.id, visibleArea: visibleArea(now, t).rect, notInside, revision: r.revision, saved: await saved(store) } };
    }

    case "set_canvas": {
      if (doc().mode === "kdp-paperback") return invalid("en una cubierta KDP el tamaño del lienzo lo fija set_print_setup");
      const r = store.applyRemote({ type: "setCanvas", widthIn: args.widthIn, heightIn: args.heightIn }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      const c = doc().canvas;
      return { ok: true, data: { revision: r.revision, canvas: { widthIn: c.widthIn, heightIn: c.heightIn }, saved: await saved(store) } };
    }

    case "set_print_setup": {
      const printSetup: PrintSetup = {
        trimWidthIn: args.trimWidthIn, trimHeightIn: args.trimHeightIn, pageCount: args.pageCount, paperAndInk: args.paperAndInk, readingDirection: "ltr",
        ...(args.binding === "hardcover" ? { binding: "hardcover" as const } : {}),
      };
      // La tapa dura exige 300 ppp: se dice qué imagen falla (core lo rechaza igualmente con printSetup: low_dpi).
      if (printSetup.binding === "hardcover" && validatePrintSetup(printSetup).ok) {
        const low = lowDpiForSetup(doc(), printSetup);
        if (low.length) return invalid(...low.map((e) => `${e.id}: ${Math.floor(e.dpi)} ppp, por debajo del mínimo de 300 ppp de la tapa dura (sube una imagen más grande o redúcela)`));
      }
      const r = store.applyRemote({ type: "setPrintSetup", printSetup }, args.expectedRevision);
      if (!r.ok) return fail(fromCommand(r.error, "element"));
      const l = kdpLayout(printSetup);
      return {
        ok: true,
        data: {
          revision: r.revision, binding: l.binding, hinges: l.hinges, canvas: { widthIn: l.widthIn, heightIn: l.heightIn }, spineIn: l.spineIn, back: l.back, spine: l.spine, front: l.front,
          safeFront: l.safe.front, safeBack: l.safe.back, spineSafe: l.spineSafe, barcode: l.barcode, saved: await saved(store),
        },
      };
    }

    case "export_kdp_pdf": {
      if (!deps.pdfDeps) return fail({ kind: "internal" });
      const d = doc();
      const pdf = deps.pdfDeps();
      // Sin companion no merece la pena renderizar a 300 ppp para fallar al final.
      if ((await pdf.companion.health(pdf.config)) !== "connected") return invalid(NO_COMPANION_MSG);
      const out = await runPdfExport(d, d.name, pdf);
      if (!out.ok) {
        const e = out.error;
        if (e.kind === "render_failed") return fail({ kind: "internal" });
        if (e.kind === "not_kdp") return invalid("el proyecto no es una cubierta KDP (usa set_print_setup)");
        if (e.kind === "low_dpi") return invalid(...e.entries.map((x) => `${x.id}: ${Math.floor(x.dpi)} ppp, por debajo del mínimo de 300 ppp de la tapa dura (sube una imagen más grande o redúcela)`));
        if (e.kind === "companion") return invalid(e.reason === "failed" ? "el companion de preimpresión falló" : NO_COMPANION_MSG);
        if (e.kind === "limit") return invalid(`la cubierta (${Math.round(e.megapixels)} MP) supera el límite de ${e.limitMegapixels} MP`);
        if (e.kind === "missing_assets") return invalid(`faltan recursos: ${e.assetIds.join(", ")}`);
        return invalid(`fuentes no disponibles: ${e.problems.map((p) => `${p.family}: ${p.reason}`).join(", ")}`);
      }
      const r = out.result;
      if (r.pdf && r.pdf.size > MAX_EXPORT_BYTES) return invalid(`el PDF (${r.pdf.size} bytes) supera el máximo del canal MCP (${MAX_EXPORT_BYTES}); usa «Exportar → PDF» en el editor`);
      const lang = readStoredLang();
      return {
        ok: true,
        data: {
          state: r.summary.state, fileName: r.fileName, pdfBase64: r.pdf ? await base64FromBlob(r.pdf) : null, reportFileName: r.reportFileName,
          reportText: reportText((k, v) => translate(lang, k, v), r), checks: r.summary.checks.map((c) => ({ id: c.id, status: c.status })), widthIn: r.widthIn, heightIn: r.heightIn,
        },
      };
    }

    case "export_image": {
      if (!deps.exportDeps) return fail({ kind: "internal" });
      const d = doc();
      const target = args.target !== undefined ? variantOf(d, args.target) : undefined;
      if (args.target !== undefined && !target) return fail({ kind: "not_found", resource: "variant", id: args.target });
      const exportDoc = target ? variantDocument(d, target) : d;
      const widthPx = target ? target.widthPx : Math.round(d.canvas.widthIn * DEFAULT_PX_PER_IN);
      const heightPx = target ? target.heightPx : Math.round(d.canvas.heightIn * DEFAULT_PX_PER_IN);
      const out = await runExport({
        doc: exportDoc, widthPx, heightPx, format: args.format, quality: args.quality ?? DEFAULT_EXPORT_QUALITY,
        destination: target ? (target.name ?? target.presetId) : "diseño base", projectName: d.name, ...(target?.formats ? { allowedFormats: target.formats } : {}),
      }, deps.exportDeps());
      if (!out.ok) {
        const e = out.error;
        if (e.kind === "render_failed" || e.kind === "encode_failed") return fail({ kind: "internal" });
        return invalid(`exportación: ${e.kind}${e.kind === "fonts" ? ` (${e.problems.map((p) => `${p.family}: ${p.reason}`).join(", ")})` : ""}`);
      }
      if (out.blob.size > MAX_EXPORT_BYTES) return invalid(`el archivo (${out.blob.size} bytes) supera el máximo del canal MCP (${MAX_EXPORT_BYTES}); usa JPEG o una variante más pequeña`);
      return {
        ok: true,
        data: { fileName: out.report.fileName, format: args.format, mimeType: out.report.mimeType, widthPx, heightPx, bytes: out.blob.size, dataBase64: await base64FromBlob(out.blob) },
      };
    }
  }
}
