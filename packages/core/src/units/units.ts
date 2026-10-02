// Conversión de unidades físicas. La pulgada es la unidad canónica (SDD D-02).
export type Unit = "in" | "mm" | "pt" | "px";

export const MM_PER_IN = 25.4;
export const PT_PER_IN = 72;

// Tolerancia documentada para comparar geometría: 0,0005 in (~0,0127 mm; 0,15 px a 300 ppp).
// El error de coma flotante de una conversión es ~1e-15 relativo, muy por debajo.
export const TOLERANCE_IN = 0.0005;

function checkNumber(v: number): void {
  if (!Number.isFinite(v)) throw new RangeError(`valor no finito: ${v}`);
}

function checkPpi(ppi: number | undefined): number {
  if (ppi === undefined || !Number.isFinite(ppi) || ppi <= 0) {
    throw new RangeError("los píxeles requieren un ppi finito y positivo");
  }
  return ppi;
}

export function toInches(value: number, unit: Unit, ppi?: number): number {
  checkNumber(value);
  switch (unit) {
    case "in": return value;
    case "mm": return value / MM_PER_IN;
    case "pt": return value / PT_PER_IN;
    case "px": return value / checkPpi(ppi);
  }
}

export function fromInches(inches: number, unit: Unit, ppi?: number): number {
  checkNumber(inches);
  switch (unit) {
    case "in": return inches;
    case "mm": return inches * MM_PER_IN;
    case "pt": return inches * PT_PER_IN;
    case "px": return inches * checkPpi(ppi);
  }
}

export function convert(value: number, from: Unit, to: Unit, ppi?: number): number {
  if (from === to) {
    checkNumber(value);
    if (from === "px") checkPpi(ppi);
    return value;
  }
  return fromInches(toInches(value, from, ppi), to, ppi);
}

// Píxeles enteros de una dimensión impresa (redondeo al más cercano).
export function inchesToPixels(inches: number, ppi: number): number {
  return Math.round(fromInches(inches, "px", ppi));
}

export function approxEqualIn(a: number, b: number, tol: number = TOLERANCE_IN): boolean {
  checkNumber(a);
  checkNumber(b);
  return Math.abs(a - b) <= tol;
}
