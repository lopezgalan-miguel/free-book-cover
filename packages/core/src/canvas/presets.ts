import { toInches } from "../units/units.js";

// Preajustes del mockup, definidos en píxeles; el documento guarda pulgadas.
// Base de conversión del modo libre: 300 ppp (SDD D-04).
export const DEFAULT_PX_PER_IN = 300;

export interface CanvasPreset {
  id: string;
  group: "kdp" | "ratio";
  label: string;
  sub: string;
  widthPx: number;
  heightPx: number;
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: "kindle", group: "kdp", label: "Kindle", sub: "1600×2560", widthPx: 1600, heightPx: 2560 },
  { id: "pb69", group: "kdp", label: "Tapa blanda", sub: "1800×2700", widthPx: 1800, heightPx: 2700 },
  { id: "wrap", group: "kdp", label: "Cubierta full", sub: "3828×2775", widthPx: 3828, heightPx: 2775 },
  { id: "audio", group: "kdp", label: "Audiolibro", sub: "2400×2400", widthPx: 2400, heightPx: 2400 },
  { id: "r23", group: "ratio", label: "2:3", sub: "portada", widthPx: 1600, heightPx: 2400 },
  { id: "r45", group: "ratio", label: "4:5", sub: "", widthPx: 1600, heightPx: 2000 },
  { id: "r11", group: "ratio", label: "1:1", sub: "", widthPx: 2000, heightPx: 2000 },
  { id: "r916", group: "ratio", label: "9:16", sub: "story", widthPx: 1350, heightPx: 2400 },
  { id: "r43", group: "ratio", label: "4:3", sub: "", widthPx: 2000, heightPx: 1500 },
  { id: "r169", group: "ratio", label: "16:9", sub: "", widthPx: 2560, heightPx: 1440 },
];

export function presetSizeIn(p: CanvasPreset, ppi: number = DEFAULT_PX_PER_IN): { widthIn: number; heightIn: number } {
  return { widthIn: toInches(p.widthPx, "px", ppi), heightIn: toInches(p.heightPx, "px", ppi) };
}
