/**
 * CONTRATO · hex
 * --------------
 * Valida y normaliza colores hexadecimales. Es la ÚNICA puerta de entrada de
 * un color al modelo: el picker nativo y el input de texto pasan por aquí para
 * que en el estado siempre haya un `#RRGGBB` en mayúsculas y válido.
 *
 * - `normalizeHex`: acepta "abc", "#abc", "AABBCC"… y devuelve `#RRGGBB` o null
 *   si no es un color válido.
 * - `isValidHex`: comprobación rápida.
 * - `hexToRgba`: color del modelo + opacidad → `rgba(...)` para el render. El
 *   modelo guarda colores opacos; la transparencia es cosa de quien pinta (la
 *   sombra la deriva de su intensidad), así que se compone aquí y no se
 *   almacena.
 */

import type { HexColor } from '@/types/editor';
import { clamp } from './clamp';

const HEX_PATTERN = /^([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHex = (input: string): HexColor | null => {
  const raw = input.trim().replace(/^#/, '');
  if (!HEX_PATTERN.test(raw)) return null;

  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;

  return `#${full.toUpperCase()}` as HexColor;
};

const isValidHex = (input: string): boolean => {
  return normalizeHex(input) !== null;
};

/**
 * Compone un color CSS con opacidad. Un color inválido devuelve negro
 * transparente: pintar mal es peor que no pintar.
 */
const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = normalizeHex(hex);
  if (!normalized) return 'rgba(0,0,0,0)';

  const digits = normalized.slice(1);
  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);

  return `rgba(${red},${green},${blue},${clamp(alpha, 0, 1)})`;
};

export { normalizeHex, isValidHex, hexToRgba };
