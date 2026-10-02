import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contraste WCAG 2.x de los tokens de index.css en las combinaciones que la interfaz usa de verdad.
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name}`);
  return m[1]!;
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
export const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const WHITE = "#ffffff";
const SURFACES = ["panel", "bg", "chip", "card", "chip-on"] as const;

describe("contraste de tokens (AA 4,5:1 para texto)", () => {
  it("el cálculo reproduce valores conocidos", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  for (const fg of ["ink", "muted", "subtle", "faint", "accent-dark", "danger", "ok", "chip-ink"] as const) {
    for (const bg of SURFACES) {
      // faint solo se usa sobre blanco o panel (etiquetas e iconos), no sobre el fondo de página ni las fichas.
      if (fg === "faint" && (bg === "bg" || bg === "chip" || bg === "chip-on")) continue;
      if ((fg === "danger" || fg === "ok") && (bg === "chip" || bg === "chip-on")) continue;
      it(`${fg} sobre ${bg}`, () => expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5));
    }
    it(`${fg} sobre blanco`, () => expect(ratio(token(fg), WHITE)).toBeGreaterThanOrEqual(4.5));
  }

  it("texto del botón de acento sobre el acento", () => expect(ratio(token("on-accent"), token("accent"))).toBeGreaterThanOrEqual(4.5));
  it("avisos: tinta sobre su fondo", () => {
    expect(ratio(token("warn-ink"), token("warn-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("danger-ink"), token("danger-bg"))).toBeGreaterThanOrEqual(4.5);
  });
  it("texto blanco del tooltip sobre tinta", () => expect(ratio(WHITE, token("ink"))).toBeGreaterThanOrEqual(4.5));
});

describe("excepciones documentadas", () => {
  it("el acento como color de texto sobre el panel no llega a AA: solo se usa en bordes y anillos", () => {
    expect(ratio(token("accent"), token("panel"))).toBeLessThan(4.5);
    expect(ratio(token("accent"), token("panel"))).toBeGreaterThanOrEqual(3); // componente de interfaz (1.4.11)
  });
});
