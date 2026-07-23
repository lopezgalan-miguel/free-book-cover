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
 */

import type { HexColor } from '@/types/editor';

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

export { normalizeHex, isValidHex };
