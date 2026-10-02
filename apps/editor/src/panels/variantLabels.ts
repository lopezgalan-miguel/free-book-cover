import { findPreset, type DigitalTarget } from "@free-book-cover/core";
import type { DictKey } from "../i18n/dictionaries";

type T = (key: DictKey, vars?: Record<string, string | number>) => string;

const PLATFORM: Record<string, DictKey> = { instagram: "platformInstagram", facebook: "platformFacebook" };
const PRESET: Record<string, DictKey> = {
  "instagram-feed-portrait": "presetInstagramFeedPortrait",
  "instagram-feed-square": "presetInstagramFeedSquare",
  "instagram-vertical": "presetInstagramVertical",
  "facebook-feed": "presetFacebookFeed",
  "facebook-vertical": "presetFacebookVertical",
};

// Nombre visible de un preajuste según el idioma.
export function presetLabel(t: T, presetId: string): string {
  const p = findPreset(presetId);
  const key = PRESET[presetId];
  if (!p || !key) return presetId;
  return `${t(PLATFORM[p.platform]!)} · ${t(key)}`;
}

// Nombre visible del destino de una variante (los personalizados muestran su tamaño).
export function targetLabel(t: T, target: DigitalTarget): string {
  if (PRESET[target.presetId]) return presetLabel(t, target.presetId);
  const size = target.widthPx && target.heightPx ? ` ${target.widthPx}×${target.heightPx}` : "";
  return `${t("customTarget")}${size}`;
}

export const gcdRatio = (w: number, h: number): string => {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(w, h);
  return `${w / d}:${h / d}`;
};
