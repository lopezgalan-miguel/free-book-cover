import type { TextElement, TextRun } from "../schema/project.js";

type RunStyle = Omit<TextRun, "text">;
type BlockStyle = Pick<TextElement, "align" | "lineHeight" | "letterSpacing">;

export interface TextDraftOptions {
  id: string;
  text: string;
  canvas: { widthIn: number; heightIn: number };
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  style?: { [K in keyof (RunStyle & BlockStyle)]?: (RunStyle & BlockStyle)[K] | undefined } | undefined;
}

// Bloque de texto nuevo: único origen de los valores por defecto (panel de capas y MCP).
// La altura es provisional (1 in): quien lo crea la ajusta con su medidor.
export function defaultTextElement(o: TextDraftOptions): TextElement {
  const s = o.style ?? {};
  const width = o.width ?? o.canvas.widthIn / 2;
  return {
    id: o.id, type: "text", x: o.x ?? (o.canvas.widthIn - width) / 2, y: o.y ?? o.canvas.heightIn * 0.65, width, height: 1,
    rotation: 0, zIndex: 0, visible: true,
    runs: [{
      text: o.text, fontFamily: s.fontFamily ?? "Lora", fontSizePt: s.fontSizePt ?? 36, weight: s.weight ?? 500, italic: s.italic ?? false,
      underline: s.underline ?? false, uppercase: s.uppercase ?? false, color: s.color ?? "#f4efe6",
    }],
    align: s.align ?? "center", lineHeight: s.lineHeight ?? 1.2, letterSpacing: s.letterSpacing ?? 0.02,
    shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
  };
}
