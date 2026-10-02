import { createProject, type Project, type TextElement, type ImageElement, type ShapeElement } from "../src/index.js";

export function textEl(id: string, over: Partial<TextElement> = {}): TextElement {
  return {
    id, type: "text", x: 1, y: 1, width: 3, height: 1, rotation: 0, zIndex: 0, visible: true,
    runs: [{ text: "Hola", fontFamily: "Lora", fontSizePt: 24, weight: 500, italic: false, underline: false, uppercase: false, color: "#f4efe6" }],
    align: "center", lineHeight: 1.2, letterSpacing: 0.02,
    shadow: { on: false, intensity: 40 }, outline: { on: false, width: 3, color: "#1a1712" }, curvature: 0,
    ...over,
  };
}
export function imageEl(id: string, assetId: string, over: Partial<ImageElement> = {}): ImageElement {
  return {
    id, type: "image", x: 0, y: 0, width: 6, height: 9, rotation: 0, zIndex: 0, visible: true,
    assetRef: { assetId }, crop: { x: 0, y: 0, width: 1, height: 1 }, fit: "cover", ...over,
  };
}
export function shapeEl(id: string, over: Partial<ShapeElement> = {}): ShapeElement {
  return { id, type: "shape", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, visible: true, shape: "rect", fill: "#000000", ...over };
}
export function baseProject(): Project {
  return createProject({ id: "p1", name: "Prueba" });
}
