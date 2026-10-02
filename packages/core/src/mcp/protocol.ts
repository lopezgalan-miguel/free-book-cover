import { z } from "zod";
import { backgroundFitSchema, colorSchema } from "../schema/project.js";

// Contrato MCP (SDD R-09): esquemas de las herramientas, errores tipificados y mensajes del canal
// companion <-> editor. Lo comparten el companion (Node) y el editor (navegador); no depende de ninguno.

export const MCP_TOOL_NAMES = ["get_canvas_state", "add_text_element", "update_element_style", "import_asset", "apply_background"] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** Límite de un recurso importado por ruta (configurable en el companion, ver MCP.md). */
export const DEFAULT_MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------- errores tipificados

export const NOT_FOUND_RESOURCES = ["project", "element", "asset", "file"] as const;
export const DISCONNECT_REASONS = ["no_companion", "no_editor", "not_authorized", "timeout"] as const;

export const toolErrorSchema = z.discriminatedUnion("kind", [
  // Parámetros inválidos: nada se ha tocado.
  z.object({ kind: z.literal("invalid_params"), issues: z.array(z.string()) }).strict(),
  // Recurso ausente (elemento, recurso, archivo o proyecto).
  z.object({ kind: z.literal("not_found"), resource: z.enum(NOT_FOUND_RESOURCES), id: z.string().optional() }).strict(),
  // Revisión obsoleta: no se mutó nada; actualRevision es la vigente.
  z.object({ kind: z.literal("conflict"), expectedRevision: z.number(), actualRevision: z.number() }).strict(),
  // Sin companion, sin editor abierto o sin autorización del usuario para este proyecto.
  z.object({ kind: z.literal("editor_disconnected"), reason: z.enum(DISCONNECT_REASONS) }).strict(),
  // Fallo inesperado: sin detalle interno.
  z.object({ kind: z.literal("internal") }).strict(),
]);
export type ToolError = z.infer<typeof toolErrorSchema>;

// ---------------------------------------------------------------- entradas

const finite = z.number().finite();
const projectId = z.string().min(1).max(200).describe("ID del proyecto autorizado en el editor.");
const expectedRevision = z.number().int().nonnegative().describe("Revisión del documento que el cliente leyó; si ya no es la vigente, la llamada se rechaza sin modificar nada.");

export const getCanvasStateInput = z
  .object({ projectId: projectId.optional().describe("Si se omite, se usa el proyecto autorizado.") })
  .strict();

const textStyle = {
  fontFamily: z.string().min(1).max(100).describe("Fuente del catálogo del editor o una fuente subida al proyecto.").optional(),
  fontSizePt: finite.positive().max(1000).optional(),
  weight: z.number().int().min(100).max(900).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  uppercase: z.boolean().optional(),
  color: colorSchema.optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: finite.positive().max(10).optional(),
  letterSpacing: finite.min(-10).max(50).optional(),
};
export const TEXT_STYLE_KEYS = Object.keys(textStyle);

export const addTextElementInput = z
  .object({
    projectId,
    expectedRevision,
    text: z.string().min(1).max(5000),
    x: finite.optional().describe("Pulgadas desde la izquierda del lienzo."),
    y: finite.optional().describe("Pulgadas desde arriba."),
    width: finite.positive().max(100).optional().describe("Ancho de la caja en pulgadas."),
    ...textStyle,
  })
  .strict();

// Propiedades permitidas de un elemento; las que no aplican al tipo del elemento se rechazan.
export const elementStyleSchema = z
  .object({
    ...textStyle,
    shadow: z.object({ on: z.boolean(), intensity: finite.min(0).max(100) }).strict().optional(),
    outline: z.object({ on: z.boolean(), width: finite.min(0).max(100), color: colorSchema }).strict().optional(),
    curvature: finite.min(-100).max(100).optional(),
    fill: colorSchema.optional().describe("Solo formas."),
    stroke: z.object({ color: colorSchema, width: finite.min(0).max(100) }).strict().optional().describe("Solo formas."),
    fit: backgroundFitSchema.optional().describe("Solo imágenes."),
    x: finite.optional(),
    y: finite.optional(),
    width: finite.min(0).max(100).optional(),
    height: finite.min(0).max(100).optional(),
    rotation: finite.optional(),
    visible: z.boolean().optional(),
  })
  .strict()
  .refine((s) => Object.values(s).some((v) => v !== undefined), { message: "style no puede estar vacío" });
export type ElementStyle = z.infer<typeof elementStyleSchema>;

export const updateElementStyleInput = z
  .object({ projectId, expectedRevision, elementId: z.string().min(1).max(200), style: elementStyleSchema })
  .strict();

export const importAssetInput = z
  .object({
    projectId,
    expectedRevision: expectedRevision.optional().describe("Opcional: si se indica y está obsoleta, no se importa nada."),
    kind: z.literal("image"),
    path: z.string().min(1).max(4096).describe("Ruta local de una imagen PNG, JPEG, WebP o GIF dentro de los directorios permitidos del companion."),
  })
  .strict();

// Lo que el companion entrega al editor: el archivo ya leído y comprobado.
export const importAssetEditorInput = z
  .object({
    projectId,
    expectedRevision: expectedRevision.optional(),
    kind: z.literal("image"),
    name: z.string().max(255).optional(),
    dataBase64: z.string().min(1),
  })
  .strict();

export const applyBackgroundInput = z
  .object({
    projectId,
    expectedRevision,
    assetId: z.string().min(1).max(200).optional().describe("ID de un recurso ya importado. Se indica este o `color`."),
    color: colorSchema.optional().describe("Fondo de color liso. Se indica este o `assetId`."),
    fit: backgroundFitSchema.optional().describe("Política de ajuste de la imagen: cover (por defecto), contain o fill."),
  })
  .strict()
  .refine((v) => (v.assetId === undefined) !== (v.color === undefined), { message: "indica exactamente uno de assetId o color" });

// ---------------------------------------------------------------- salidas

const summaryBase = { id: z.string(), type: z.enum(["text", "image", "shape"]), x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotation: z.number(), zIndex: z.number(), visible: z.boolean() };
export const elementSummarySchema = z
  .object({
    ...summaryBase,
    text: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSizePt: z.number().optional(),
    color: z.string().optional(),
    assetId: z.string().optional(),
    fill: z.string().optional(),
  })
  .strict();
export type ElementSummary = z.infer<typeof elementSummarySchema>;

export const getCanvasStateOutput = z
  .object({
    projectId: z.string(),
    name: z.string(),
    mode: z.enum(["kdp-paperback", "digital", "freeform"]),
    revision: z.number().int(),
    canvas: z.object({ widthIn: z.number(), heightIn: z.number(), background: z.union([z.object({ assetId: z.string() }), z.string()]), fit: z.enum(["cover", "contain", "fill"]) }).strict(),
    elements: z.array(elementSummarySchema),
    assets: z.array(z.object({ id: z.string(), kind: z.enum(["image", "font"]), mimeType: z.string(), widthPx: z.number().optional(), heightPx: z.number().optional(), sizeBytes: z.number().optional() }).strict()),
  })
  .strict();

const saved = z.boolean().describe("Si el editor pudo guardar el proyecto tras el cambio.");
export const addTextElementOutput = z.object({ elementId: z.string(), revision: z.number().int(), saved }).strict();
export const updateElementStyleOutput = z.object({ element: elementSummarySchema, revision: z.number().int(), saved }).strict();
export const importAssetOutput = z
  .object({ assetId: z.string(), revision: z.number().int(), mimeType: z.string(), widthPx: z.number(), heightPx: z.number(), sizeBytes: z.number(), saved })
  .strict();
export const applyBackgroundOutput = z.object({ revision: z.number().int(), background: z.union([z.object({ assetId: z.string() }), z.string()]), fit: z.enum(["cover", "contain", "fill"]), saved }).strict();

export const MCP_TOOLS = {
  get_canvas_state: { description: "Devuelve un resumen del documento: IDs, medidas en pulgadas, elementos, recursos y la revisión vigente.", input: getCanvasStateInput, output: getCanvasStateOutput, readOnly: true },
  add_text_element: { description: "Añade un elemento de texto al lienzo (comando addElement del editor). Posiciones y anchos en pulgadas.", input: addTextElementInput, output: addTextElementOutput, readOnly: false },
  update_element_style: { description: "Cambia propiedades permitidas de un elemento existente (tipografía, color, efectos, geometría).", input: updateElementStyleInput, output: updateElementStyleOutput, readOnly: false },
  import_asset: { description: "Importa una imagen local (dentro de los directorios permitidos y del límite de tamaño) como recurso del proyecto.", input: importAssetInput, output: importAssetOutput, readOnly: false },
  apply_background: { description: "Aplica como fondo un recurso importado (con política de ajuste) o un color liso.", input: applyBackgroundInput, output: applyBackgroundOutput, readOnly: false },
} as const;

/** Esquema JSON de una herramienta (MCP lo exige de tipo object). */
export function toolJsonSchema(name: McpToolName, io: "input" | "output"): Record<string, unknown> {
  const { $schema: _s, ...rest } = z.toJSONSchema(MCP_TOOLS[name][io], { io: io === "input" ? "input" : "output", unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
}

// ---------------------------------------------------------------- canal WebSocket

const callId = z.string().min(1).max(64);
const hello = z.object({ type: z.literal("hello"), token: z.string().min(1).max(512) }).strict();
const call = z.object({ type: z.literal("call"), id: callId, tool: z.enum(MCP_TOOL_NAMES), args: z.unknown() }).strict();
const result = z.discriminatedUnion("ok", [
  z.object({ type: z.literal("result"), id: callId, ok: z.literal(true), data: z.unknown() }).strict(),
  z.object({ type: z.literal("result"), id: callId, ok: z.literal(false), error: toolErrorSchema }).strict(),
]);

// Editor -> companion.
export const editorToServerSchema = z.union([
  hello,
  z.object({ type: z.literal("authorize"), projectId: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal("revoke") }).strict(),
  result,
]);
// Companion -> editor.
export const serverToEditorSchema = z.union([
  z.object({ type: z.literal("ready"), mcpClients: z.number().int() }).strict(),
  z.object({ type: z.literal("status"), mcpClients: z.number().int() }).strict(),
  call,
]);
// Cliente MCP (proceso stdio) -> companion.
export const mcpToServerSchema = z.union([hello, call]);
// Companion -> cliente MCP.
export const serverToMcpSchema = z.union([z.object({ type: z.literal("ready") }).strict(), result]);

export type EditorToServer = z.infer<typeof editorToServerSchema>;
export type ServerToEditor = z.infer<typeof serverToEditorSchema>;
export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: ToolError };

export const WS_CLOSE = { unauthorized: 4401, protocol: 4400, replaced: 4409, tooLarge: 1009 } as const;
export const WS_EDITOR_PATH = "/ws/editor";
export const WS_MCP_PATH = "/ws/mcp";
