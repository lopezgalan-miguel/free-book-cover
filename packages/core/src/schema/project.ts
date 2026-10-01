import { z } from "zod";

// Versión actual del esquema persistido (SDD §3 D-03, §4).
export const CURRENT_SCHEMA_VERSION = 1;

// Límites de producto del lienzo, en pulgadas (SDD §6: límites propuestos).
export const MAX_CANVAS_IN = 100;

const finite = z.number().finite();
const positiveIn = finite.positive().max(MAX_CANVAS_IN);

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "color #rrggbb");
export const assetRefSchema = z.object({ assetId: z.string().min(1) }).strict();
export const backgroundSchema = z.union([assetRefSchema, colorSchema]);

const elementBase = {
  id: z.string().min(1),
  x: finite,
  y: finite,
  width: finite.nonnegative(),
  height: finite.nonnegative(),
  rotation: finite,
  zIndex: z.number().int(),
  visible: z.boolean(),
};

export const textRunSchema = z
  .object({
    text: z.string(),
    fontFamily: z.string().min(1),
    fontSizePt: finite.positive(),
    weight: z.number().int().min(100).max(900),
    italic: z.boolean(),
    underline: z.boolean(),
    uppercase: z.boolean(),
    color: colorSchema,
  })
  .strict();

export const textElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("text"),
    runs: z.array(textRunSchema),
    align: z.enum(["left", "center", "right", "justify"]),
    lineHeight: finite.positive(),
    letterSpacing: finite,
    shadow: z.object({ on: z.boolean(), intensity: finite.min(0).max(100) }).strict(),
    outline: z.object({ on: z.boolean(), width: finite.min(0), color: colorSchema }).strict(),
    curvature: finite.min(-100).max(100),
    texture: assetRefSchema.optional(),
  })
  .strict();

export const imageElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("image"),
    assetRef: assetRefSchema,
    // Recorte normalizado (0..1) sobre la imagen original.
    crop: z
      .object({
        x: finite.min(0).max(1),
        y: finite.min(0).max(1),
        width: finite.positive().max(1),
        height: finite.positive().max(1),
      })
      .strict(),
    fit: z.enum(["cover", "contain", "fill"]),
  })
  .strict();

export const shapeElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("shape"),
    shape: z.enum(["rect", "ellipse"]),
    fill: colorSchema,
    stroke: z.object({ color: colorSchema, width: finite.min(0) }).strict().optional(),
  })
  .strict();

export const elementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
]);

export const assetSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["image", "font"]),
    mimeType: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const printSetupSchema = z
  .object({
    trimWidthIn: positiveIn,
    trimHeightIn: positiveIn,
    pageCount: z.number().int().positive(),
    paperAndInk: z.string().min(1),
    readingDirection: z.literal("ltr"),
  })
  .strict();

// Solo esquema: la lógica de destinos digitales llega en el paso 5.
export const digitalTargetSchema = z
  .object({
    presetId: z.string().min(1),
    presetVersion: z.number().int().nonnegative(),
    layoutOverrides: z.record(z.string(), z.unknown()),
  })
  .strict();

export const projectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string(),
    mode: z.enum(["kdp-paperback", "digital", "freeform"]),
    printSetup: printSetupSchema.optional(),
    canvas: z
      .object({ widthIn: positiveIn, heightIn: positiveIn, background: backgroundSchema })
      .strict(),
    digitalTargets: z.array(digitalTargetSchema).optional(),
    elements: z.array(elementSchema),
    assets: z.array(assetSchema),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const assetIds = new Set<string>();
    for (const a of p.assets) {
      if (assetIds.has(a.id)) ctx.addIssue({ code: "custom", message: `asset duplicado: ${a.id}` });
      assetIds.add(a.id);
    }
    const elementIds = new Set<string>();
    const needAsset = (id: string, where: string) => {
      if (!assetIds.has(id)) ctx.addIssue({ code: "custom", message: `${where} referencia un recurso inexistente: ${id}` });
    };
    for (const e of p.elements) {
      if (elementIds.has(e.id)) ctx.addIssue({ code: "custom", message: `elemento duplicado: ${e.id}` });
      elementIds.add(e.id);
      if (e.type === "image") needAsset(e.assetRef.assetId, e.id);
      if (e.type === "text" && e.texture) needAsset(e.texture.assetId, e.id);
    }
    if (typeof p.canvas.background === "object") needAsset(p.canvas.background.assetId, "canvas");
  });

export type Color = z.infer<typeof colorSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type TextRun = z.infer<typeof textRunSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type Element = z.infer<typeof elementSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Project = z.infer<typeof projectSchema>;

// Proyecto vacío válido (modo libre, 6 × 9 in).
export function createProject(init: { id: string; name?: string; mode?: Project["mode"] }): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: init.id,
    name: init.name ?? "",
    mode: init.mode ?? "freeform",
    canvas: { widthIn: 6, heightIn: 9, background: "#ffffff" },
    elements: [],
    assets: [],
    revision: 0,
  };
}
