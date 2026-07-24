/**
 * CONTRATO · curvedText
 * ---------------------
 * Calcula la geometría para pintar un texto siguiendo una curva (arco), según
 * la propiedad `curve` del bloque (-100…100). Lo usan tanto el preview (SVG
 * <textPath>) como `renderToCanvas` (posicionando cada glifo sobre el arco).
 *
 * Cómo lo hará: a partir del texto, tamaño de fuente y curvatura, devuelve el
 * path del arco y/o las posiciones y ángulos por carácter, sin tocar el DOM
 * (función pura y testeable). Curva 0 = recto (el llamante puede saltarse esto).
 */

export interface CurvedTextInput {
  text: string;
  fontSizePx: number;
  /** -100 (cóncavo) … 0 (recto) … 100 (convexo). */
  curve: number;
}

export interface CurvedTextGeometry {
  /** Anchura total ocupada por el texto curvo, en px. */
  width: number;
  /** Altura total, en px. */
  height: number;
  /** Path SVG del arco base sobre el que se asienta el texto. */
  pathD: string;
}

export const computeCurvedText = (curvedTextInput: CurvedTextInput): CurvedTextGeometry => {
  void curvedTextInput; // stub: la firma ya es definitiva, el cuerpo llega en la Fase 4
  throw new Error('computeCurvedText: pendiente de implementar');
};
