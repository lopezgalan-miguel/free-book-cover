// Catálogo de preajustes digitales (SDD R-08, D-08). Son datos versionados: cambiarlos no altera
// las variantes ya guardadas, que conservan presetVersion y las dimensiones resueltas.
// Valores y fuentes en sources.md.
export type DigitalPlatform = "instagram" | "facebook" | "custom";
export type ExportFormat = "png" | "jpeg" | "webp";

export interface DigitalPreset {
  id: string;
  platform: DigitalPlatform;
  // Destino dentro de la plataforma (clave estable; el texto visible lo pone la interfaz).
  destination: "feed" | "vertical" | "custom";
  label: string;
  widthPx: number;
  heightPx: number;
  formats: readonly ExportFormat[];
  // Versión del propio preajuste: sube cuando cambian sus valores.
  version: number;
  // Fecha (AAAA-MM-DD) en que el valor se fijó en el catálogo. No acredita una verificación contra la
  // documentación oficial de la plataforma (ver sources.md).
  reviewedAt: string;
}

export const DIGITAL_CATALOG_VERSION = 1;
export const DIGITAL_CATALOG_REVIEWED_AT = "2026-10-02";
const ALL: readonly ExportFormat[] = ["png", "jpeg", "webp"];
const STILL: readonly ExportFormat[] = ["png", "jpeg"];

export const DIGITAL_PRESETS: readonly DigitalPreset[] = [
  { id: "instagram-feed-portrait", platform: "instagram", destination: "feed", label: "Feed vertical 4:5", widthPx: 1080, heightPx: 1350, formats: STILL, version: 1, reviewedAt: DIGITAL_CATALOG_REVIEWED_AT },
  { id: "instagram-feed-square", platform: "instagram", destination: "feed", label: "Feed cuadrado 1:1", widthPx: 1080, heightPx: 1080, formats: STILL, version: 1, reviewedAt: DIGITAL_CATALOG_REVIEWED_AT },
  { id: "instagram-vertical", platform: "instagram", destination: "vertical", label: "Vertical 9:16", widthPx: 1080, heightPx: 1920, formats: STILL, version: 1, reviewedAt: DIGITAL_CATALOG_REVIEWED_AT },
  { id: "facebook-feed", platform: "facebook", destination: "feed", label: "Feed 4:5", widthPx: 1080, heightPx: 1350, formats: ALL, version: 1, reviewedAt: DIGITAL_CATALOG_REVIEWED_AT },
  { id: "facebook-vertical", platform: "facebook", destination: "vertical", label: "Vertical 9:16", widthPx: 1080, heightPx: 1920, formats: ALL, version: 1, reviewedAt: DIGITAL_CATALOG_REVIEWED_AT },
];

export const CUSTOM_PRESET_ID = "custom";
export const CUSTOM_PRESET_VERSION = 1;

export function findPreset(id: string, catalog: readonly DigitalPreset[] = DIGITAL_PRESETS): DigitalPreset | undefined {
  return catalog.find((p) => p.id === id);
}

export function aspectRatio(widthPx: number, heightPx: number): number {
  return widthPx / heightPx;
}
