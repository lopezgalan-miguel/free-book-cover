import { z } from "zod";
import { DIGITAL_PRESETS } from "../presets/digital.js";
import { PAPERS } from "../kdp/kdp.js";
import { TEXTURE_KINDS } from "../textures/generate.js";
import {
  MAX_TARGET_PX, backgroundFitSchema, backgroundOverrideSchema, colorSchema, elementOverrideSchema, imageFiltersSchema, innerShadowSchema,
  textMaskSchema, textTextureSchema, viewOverrideSchema,
} from "../schema/project.js";

// Contrato MCP (SDD R-09): esquemas de las herramientas, errores tipificados y mensajes del canal
// companion <-> editor. Lo comparten el companion (Node) y el editor (navegador); no depende de ninguno.

export const MCP_TOOL_NAMES = [
  "get_canvas_state", "add_text_element", "update_element_style", "import_asset", "apply_background",
  "import_font", "add_image_element", "add_shape_element", "add_variant", "update_variant", "set_print_setup", "export_image", "set_canvas",
  "set_background_filters", "generate_texture",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** Límite de un recurso importado por ruta (configurable en el companion, ver MCP.md). */
export const DEFAULT_MAX_IMPORT_BYTES = 20 * 1024 * 1024;
/** Máximo de un archivo exportado por MCP: en base64 debe caber en un mensaje del canal (40 MB). */
export const MAX_EXPORT_BYTES = 28 * 1024 * 1024;

// ---------------------------------------------------------------- errores tipificados

export const NOT_FOUND_RESOURCES = ["project", "element", "asset", "file", "variant"] as const;
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
  // El companion tiene demasiadas llamadas en curso; reintentar más tarde.
  z.object({ kind: z.literal("busy") }).strict(),
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

// Fragmento con estilo propio; lo que no indique lo toma del estilo del elemento.
export const runInputSchema = z
  .object({
    text: z.string().max(5000),
    fontFamily: textStyle.fontFamily,
    fontSizePt: textStyle.fontSizePt,
    weight: textStyle.weight,
    italic: textStyle.italic,
    underline: textStyle.underline,
    uppercase: textStyle.uppercase,
    color: textStyle.color,
  })
  .strict();
export type RunInput = z.infer<typeof runInputSchema>;
const runsInput = z.array(runInputSchema).min(1).max(200);

export const addTextElementInput = z
  .object({
    projectId,
    expectedRevision,
    text: z.string().min(1).max(5000).optional(),
    runs: runsInput.optional().describe("Fragmentos con estilos distintos (alternativa a text); los estilos del elemento son el valor por defecto de cada uno."),
    x: finite.optional().describe("Pulgadas desde la izquierda del lienzo."),
    y: finite.optional().describe("Pulgadas desde arriba."),
    width: finite.positive().max(100).optional().describe("Ancho de la caja en pulgadas."),
    ...textStyle,
  })
  .strict()
  .refine((a) => (a.text === undefined) !== (a.runs === undefined), { message: "indica exactamente uno de text o runs" });

const unit = finite.min(0).max(1);
const cropSchema = z.object({ x: unit, y: unit, width: finite.positive().max(1), height: finite.positive().max(1) }).strict();
const inches = finite.min(-100).max(100);
const size = finite.positive().max(100);

// Propiedades permitidas de un elemento; las que no aplican al tipo del elemento se rechazan.
export const elementStyleSchema = z
  .object({
    ...textStyle,
    runs: runsInput.optional().describe("Solo textos: sustituye el texto entero por fragmentos. Las claves de fragmento de style son el valor por defecto de cada uno; lo que nadie indica se hereda del primer fragmento actual."),
    shadow: z
      .object({
        on: z.boolean(),
        intensity: finite.min(0).max(100),
        color: colorSchema.optional(),
        opacity: finite.min(0).max(1).optional(),
        angle: finite.optional(),
        distance: finite.min(0).max(1).optional(),
      })
      .strict()
      .optional()
      .describe("Solo textos: intensity (0..100) es el desenfoque; color, opacity (0..1), angle (grados, 90 = abajo) y distance (em, 0..1) son opcionales."),
    innerShadow: innerShadowSchema.nullable().optional().describe("Solo textos: sombra dentro de la letra (relieve o bordes oscurecidos); distance y blur en em. null la quita."),
    mask: textMaskSchema.nullable().optional().describe("Solo textos: máscara de recorte (assetId de una imagen, colocada como la textura). mode dark/light/alpha borra la letra donde la imagen es oscura, clara o transparente, por debajo de threshold (0..1), con rampa softness. Con el mismo assetId que la textura: grietas huecas. null la quita."),
    stretch: finite.min(25).max(200).nullable().optional().describe("Solo textos con una fuente variable subida: anchura (eje wdth, %) de todos los fragmentos. null la quita; cambiar fontFamily sin indicarla también."),
    opacity: finite.min(0).max(1).optional().describe("Opacidad de la capa (0..1)."),
    filters: imageFiltersSchema.nullable().optional().describe("Solo imágenes: blur (0..100), brightness y saturation (%, 100 = sin cambio). null los quita."),
    outline: z.object({ on: z.boolean(), width: finite.min(0).max(100), color: colorSchema }).strict().optional(),
    curvature: finite.min(-100).max(100).optional(),
    scaleX: finite.min(0.5).max(1.5).optional().describe("Solo textos: anchura de las letras (1 = normal, 0,5–1,5). La caja se ensancha o estrecha con ellas (centro o borde de la alineación quieto) salvo que se indique width o x."),
    texture: textTextureSchema.nullable().optional().describe("Solo textos: textura del relleno (assetId de una imagen importada; fit cover o tile con tileIn en pulgadas). null la quita."),
    fill: colorSchema.optional().describe("Solo formas."),
    stroke: z.object({ color: colorSchema, width: finite.min(0).max(100) }).strict().optional().describe("Solo formas."),
    fit: backgroundFitSchema.optional().describe("Solo imágenes."),
    crop: cropSchema.optional().describe("Solo imágenes: recorte normalizado 0..1 sobre la imagen original."),
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

export const importFontInput = z
  .object({
    projectId,
    expectedRevision: expectedRevision.optional().describe("Opcional: si se indica y está obsoleta, no se importa nada."),
    path: z.string().min(1).max(4096).describe("Ruta local de una fuente .ttf, .otf o .woff2 dentro de los directorios permitidos del companion. La licencia es responsabilidad de quien la aporta."),
  })
  .strict();
export const importFontEditorInput = z
  .object({ projectId, expectedRevision: expectedRevision.optional(), name: z.string().min(1).max(255), dataBase64: z.string().min(1) })
  .strict();

export const addImageElementInput = z
  .object({
    projectId,
    expectedRevision,
    assetId: z.string().min(1).max(200).describe("Imagen ya importada con import_asset."),
    x: inches.optional(),
    y: inches.optional(),
    width: size.optional().describe("Sin ancho ni alto: caja con la proporción de la imagen, al 80 % del lienzo y centrada."),
    height: size.optional(),
    rotation: finite.optional(),
    fit: backgroundFitSchema.optional(),
    crop: cropSchema.optional(),
  })
  .strict()
  .refine((v) => (v.width === undefined) === (v.height === undefined), { message: "width y height van juntos" });

export const addShapeElementInput = z
  .object({
    projectId,
    expectedRevision,
    shape: z.enum(["rect", "ellipse"]),
    x: inches,
    y: inches,
    width: size,
    height: size,
    rotation: finite.optional(),
    fill: colorSchema,
    stroke: z.object({ color: colorSchema, width: finite.min(0).max(100) }).strict().optional(),
  })
  .strict();

export const VARIANT_PRESET_IDS = ["custom", ...DIGITAL_PRESETS.map((p) => p.id)] as [string, ...string[]];
export const addVariantInput = z
  .object({
    projectId,
    expectedRevision,
    presetId: z.enum(VARIANT_PRESET_IDS).describe("Preajuste digital (p. ej. instagram-feed-portrait) o custom con widthPx y heightPx."),
    widthPx: z.number().int().min(1).max(MAX_TARGET_PX).optional(),
    heightPx: z.number().int().min(1).max(MAX_TARGET_PX).optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((v) => (v.presetId === "custom") === (v.widthPx !== undefined && v.heightPx !== undefined), { message: "widthPx y heightPx solo (y siempre) con presetId custom" });

export const updateVariantInput = z
  .object({
    projectId,
    expectedRevision,
    targetId: z.string().min(1).max(200),
    view: viewOverrideSchema.optional().describe("Encuadre: x, y (0..1, 0,5 = centrado) y zoom (1..8) de la zona visible del diseño base."),
    background: backgroundOverrideSchema.optional(),
    elements: z.record(z.string().min(1).max(200), elementOverrideSchema).optional().describe("Ajustes por elemento en pulgadas de la variante (x, y, width, height, rotation, visible, fontScale, fit, crop)."),
  })
  .strict()
  .refine((v) => v.view !== undefined || v.background !== undefined || v.elements !== undefined, { message: "indica view, background o elements" });

export const setCanvasInput = z
  .object({ projectId, expectedRevision, widthIn: finite.positive().max(100), heightIn: finite.positive().max(100) })
  .strict();

export const setPrintSetupInput = z
  .object({
    projectId,
    expectedRevision,
    trimWidthIn: finite.positive().max(100),
    trimHeightIn: finite.positive().max(100),
    pageCount: z.number().int().positive().max(10000),
    paperAndInk: z.enum(PAPERS.map((p) => p.id) as [string, ...string[]]),
    binding: z.enum(["paperback", "hardcover"]).optional().describe("Encuadernación; por defecto tapa blanda. La tapa dura exige 300 ppp en todas las imágenes."),
  })
  .strict();

export const exportImageInput = z
  .object({
    projectId,
    target: z.string().min(1).max(200).optional().describe("ID de una variante; si se omite, el diseño base a 300 ppp."),
    format: z.enum(["png", "jpeg", "webp"]),
    quality: z.number().int().min(1).max(100).optional().describe("Solo JPEG y WebP (por defecto 92)."),
  })
  .strict();
// Lo que el editor devuelve al companion; el proceso MCP escribe el archivo y responde con la ruta.
export const exportImageEditorOutput = z
  .object({ fileName: z.string().min(1).max(255), format: z.enum(["png", "jpeg", "webp"]), mimeType: z.string(), widthPx: z.number().int(), heightPx: z.number().int(), bytes: z.number().int(), dataBase64: z.string().min(1) })
  .strict();

export const applyBackgroundInput = z
  .object({
    projectId,
    expectedRevision,
    assetId: z.string().min(1).max(200).optional().describe("ID de un recurso ya importado. Se indica este o `color`."),
    color: colorSchema.optional().describe("Fondo de color liso. Se indica este o `assetId`."),
    fit: backgroundFitSchema.optional().describe("Política de ajuste de la imagen: cover (por defecto), contain o fill."),
    filters: imageFiltersSchema.nullable().optional().describe("Solo con assetId: desenfoque, brillo y saturación del fondo. null los quita; sin indicar, se conservan."),
  })
  .strict()
  .refine((v) => (v.assetId === undefined) !== (v.color === undefined), { message: "indica exactamente uno de assetId o color" });

export const setBackgroundFiltersInput = z
  .object({ projectId, expectedRevision, filters: imageFiltersSchema.nullable().describe("blur (0..100), brightness y saturation (%, 100 = sin cambio); null los quita.") })
  .strict();

export const generateTextureInput = z
  .object({
    projectId,
    expectedRevision: expectedRevision.optional().describe("Opcional: si se indica y está obsoleta, no se genera nada."),
    kind: z.enum(TEXTURE_KINDS).describe("cracked-marble (placas con grietas), stone o paper."),
    seed: z.number().int().min(0).max(2 ** 31 - 1).describe("Misma semilla, misma textura."),
    sizePx: z.number().int().min(64).max(2048).optional().describe("Lado de la tesela cuadrada (por defecto 1024)."),
    scale: z.number().int().min(1).max(32).optional().describe("Placas o granos a lo ancho de la tesela."),
    color: colorSchema.optional().describe("Color base."),
    cracks: z.enum(["holes", "lines"]).optional().describe("Solo mármol: grietas transparentes (por defecto) o líneas opacas."),
    crackColor: colorSchema.optional().describe("Solo mármol con cracks lines: color de las grietas (por defecto #460808)."),
  })
  .strict();

// ---------------------------------------------------------------- salidas

const summaryBase = { id: z.string(), type: z.enum(["text", "image", "shape"]), x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotation: z.number(), zIndex: z.number(), visible: z.boolean() };
export const elementSummarySchema = z
  .object({
    ...summaryBase,
    text: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSizePt: z.number().optional(),
    color: z.string().optional(),
    runs: z.array(z.object({ text: z.string(), fontFamily: z.string(), fontSizePt: z.number(), weight: z.number(), italic: z.boolean(), color: z.string() }).strict()).optional(),
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
    assets: z.array(z.object({ id: z.string(), kind: z.enum(["image", "font"]), mimeType: z.string(), widthPx: z.number().optional(), heightPx: z.number().optional(), sizeBytes: z.number().optional(), family: z.string().optional() }).strict()),
    printSetup: z.object({ trimWidthIn: z.number(), trimHeightIn: z.number(), pageCount: z.number().int(), paperAndInk: z.string() }).strict().optional(),
    variants: z.array(z.object({ id: z.string(), name: z.string(), presetId: z.string(), widthPx: z.number().int(), heightPx: z.number().int() }).strict()).optional(),
  })
  .strict();

const saved = z.boolean().describe("Si el editor pudo guardar el proyecto tras el cambio.");
const rectOut = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict();
export const addTextElementOutput = z.object({ elementId: z.string(), revision: z.number().int(), saved }).strict();
export const updateElementStyleOutput = z.object({ element: elementSummarySchema, revision: z.number().int(), saved }).strict();
export const importAssetOutput = z
  .object({ assetId: z.string(), revision: z.number().int(), mimeType: z.string(), widthPx: z.number(), heightPx: z.number(), sizeBytes: z.number(), saved })
  .strict();
const fontAxisOut = z.object({ tag: z.string(), min: z.number(), def: z.number(), max: z.number() }).strict();
export const importFontOutput = z
  .object({ assetId: z.string(), family: z.string(), revision: z.number().int(), sizeBytes: z.number(), axes: z.array(fontAxisOut).nullable().describe("Ejes de una fuente variable (wght se usa con weight y wdth con stretch); null si no es variable o es WOFF2."), saved })
  .strict();
const filtersOut = z.object({ blur: z.number().optional(), brightness: z.number().optional(), saturation: z.number().optional() }).strict();
export const setBackgroundFiltersOutput = z.object({ revision: z.number().int(), filters: filtersOut.nullable(), saved }).strict();
export const generateTextureOutput = z.object({ assetId: z.string(), widthPx: z.number().int(), heightPx: z.number().int(), revision: z.number().int(), saved }).strict();
export const addElementOutput = z.object({ elementId: z.string(), revision: z.number().int(), saved }).strict();
export const addVariantOutput = z.object({ targetId: z.string(), widthPx: z.number().int(), heightPx: z.number().int(), revision: z.number().int(), saved }).strict();
export const updateVariantOutput = z
  .object({
    targetId: z.string(),
    visibleArea: rectOut.describe("Zona del diseño base (pulgadas del base) que se ve en la variante."),
    notInside: z.array(z.object({ id: z.string(), visibility: z.enum(["partial", "outside"]) }).strict()).describe("Elementos cortados o fuera del lienzo de la variante."),
    revision: z.number().int(),
    saved,
  })
  .strict();
export const setPrintSetupOutput = z
  .object({
    revision: z.number().int(),
    binding: z.enum(["paperback", "hardcover"]),
    canvas: z.object({ widthIn: z.number(), heightIn: z.number() }).strict(),
    spineIn: z.number(),
    // Solo tapa dura: x de las dos líneas de bisagra (no poner texto entre ellas y el lomo).
    hinges: z.tuple([z.number(), z.number()]).nullable(),
    back: rectOut,
    spine: rectOut,
    front: rectOut,
    safeFront: rectOut,
    safeBack: rectOut,
    spineSafe: rectOut.nullable(),
    barcode: rectOut,
    saved,
  })
  .strict();
export const setCanvasOutput = z.object({ revision: z.number().int(), canvas: z.object({ widthIn: z.number(), heightIn: z.number() }).strict(), saved }).strict();
export const exportImageOutput = z
  .object({ path: z.string(), fileName: z.string(), format: z.enum(["png", "jpeg", "webp"]), widthPx: z.number().int(), heightPx: z.number().int(), bytes: z.number().int() })
  .strict();

export const applyBackgroundOutput = z.object({ revision: z.number().int(), background: z.union([z.object({ assetId: z.string() }), z.string()]), fit: z.enum(["cover", "contain", "fill"]), saved }).strict();

export const MCP_TOOLS = {
  get_canvas_state: { description: "Devuelve un resumen del documento: IDs, medidas en pulgadas, elementos, recursos y la revisión vigente.", input: getCanvasStateInput, output: getCanvasStateOutput, readOnly: true },
  add_text_element: { description: "Añade un elemento de texto al lienzo (comando addElement del editor). Posiciones y anchos en pulgadas.", input: addTextElementInput, output: addTextElementOutput, readOnly: false },
  update_element_style: { description: "Cambia propiedades permitidas de un elemento existente (tipografía, color, efectos, geometría).", input: updateElementStyleInput, output: updateElementStyleOutput, readOnly: false },
  import_asset: { description: "Importa una imagen local (dentro de los directorios permitidos y del límite de tamaño) como recurso del proyecto.", input: importAssetInput, output: importAssetOutput, readOnly: false },
  apply_background: { description: "Aplica como fondo un recurso importado (con política de ajuste) o un color liso.", input: applyBackgroundInput, output: applyBackgroundOutput, readOnly: false },
  import_font: { description: "Importa una fuente local (.ttf, .otf, .woff2) al proyecto; devuelve la familia para usarla en fontFamily.", input: importFontInput, output: importFontOutput, readOnly: false },
  add_image_element: { description: "Añade una capa de imagen con un recurso importado (posición, tamaño, encaje y recorte).", input: addImageElementInput, output: addElementOutput, readOnly: false },
  add_shape_element: { description: "Añade un rectángulo o una elipse con relleno y borde opcional.", input: addShapeElementInput, output: addElementOutput, readOnly: false },
  add_variant: { description: "Añade una variante digital (preajuste de redes o tamaño propio) derivada del diseño base.", input: addVariantInput, output: addVariantOutput, readOnly: false },
  update_variant: { description: "Ajusta una variante en un solo paso: encuadre (zona visible y zoom), fondo y ajustes por elemento. Devuelve el área visible y los elementos cortados.", input: updateVariantInput, output: updateVariantOutput, readOnly: false },
  set_print_setup: { description: "Configura la cubierta KDP de tapa blanda o dura (corte, páginas, papel, encuadernación): ajusta el lienzo y devuelve la geometría (lomo, caras, bisagras, zonas seguras, código de barras) en pulgadas. En tapa dura, si alguna imagen queda por debajo de 300 ppp, es invalid_params con la lista.", input: setPrintSetupInput, output: setPrintSetupOutput, readOnly: false },
  set_canvas: { description: "Cambia el tamaño del lienzo (pulgadas) en modo libre o digital; los elementos no se mueven. En una cubierta KDP el tamaño lo fija set_print_setup.", input: setCanvasInput, output: setCanvasOutput, readOnly: false },
  set_background_filters: { description: "Desenfoca, oscurece o desatura el fondo (filtros de imagen del lienzo) sin preparar la imagen fuera.", input: setBackgroundFiltersInput, output: setBackgroundFiltersOutput, readOnly: false },
  generate_texture: { description: "Genera una textura incluida y sin costuras (mármol agrietado, piedra o papel) como recurso de imagen, para usarla en texture o mask de un texto en mosaico.", input: generateTextureInput, output: generateTextureOutput, readOnly: false },
  export_image: { description: "Exporta el diseño base (300 ppp) o una variante como PNG, JPEG o WebP y lo guarda en el directorio de exportación del companion (FBC_EXPORT_DIR).", input: exportImageInput, output: exportImageOutput, readOnly: true },
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
