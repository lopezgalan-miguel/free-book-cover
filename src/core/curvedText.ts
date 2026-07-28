/**
 * CONTRATO · curvedText
 * ---------------------
 * Calcula la geometría para pintar un texto siguiendo una curva (arco), según
 * la propiedad `curve` del bloque (-100…100). Lo usan tanto el preview (SVG
 * <textPath>) como `renderToCanvas` (posicionando cada glifo sobre el arco).
 *
 * Cómo lo hace: a partir del texto, tamaño de fuente y curvatura devuelve la
 * caja que ocupa el texto curvo, el path SVG del arco y sus tres puntos de
 * control. Función pura y testeable: no toca el DOM ni mide texto real (la
 * anchura se estima con un ancho medio de glifo, suficiente para dimensionar
 * el arco; quien pinta centra el texto sobre él). Curva 0 = recto, y el
 * llamante puede saltarse todo esto.
 *
 * El arco es una Bézier CUADRÁTICA. El preview la consume como `pathD` y el
 * canvas como puntos (`start`/`control`/`end`) más `pointAtDistance`, que la
 * recorre por longitud de arco para repartir los glifos. Los dos caminos salen
 * de la MISMA geometría: si cada uno dibujase su propia curva, el preview y la
 * exportación dejarían de coincidir, que es justo lo que este módulo evita.
 */

import { clamp } from '@/utils/clamp';

/** Anchura media de un glifo respecto al tamaño de fuente. */
const GLYPH_WIDTH_RATIO = 0.62;
/** Cuánto se hunde/eleva el centro del arco respecto a su anchura. */
const SAG_RATIO = 0.32;
/** Altura de la línea base respecto al tamaño de fuente. */
const BASELINE_RATIO = 1.05;
/** Margen inferior para los descendentes (g, j, p…). */
const DESCENDER_RATIO = 0.35;
/** Muestras con las que se aproxima la longitud del arco. */
const CURVE_SAMPLES = 240;

export interface CurvedTextInput {
  text: string;
  fontSizePx: number;
  /** -100 (cóncavo) … 0 (recto) … 100 (convexo). */
  curve: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurvedTextGeometry {
  /** Anchura total ocupada por el texto curvo, en px. */
  width: number;
  /** Altura total, en px. */
  height: number;
  /** Path SVG del arco base sobre el que se asienta el texto. */
  pathD: string;
  /** Puntos de la Bézier cuadrática del arco (mismo trazo que `pathD`). */
  start: CurvePoint;
  control: CurvePoint;
  end: CurvePoint;
}

/**
 * Texto tal y como se pinta sobre el arco: un arco es UNA línea, así que los
 * saltos se convierten en espacio doble (igual que en el mockup) en vez de
 * perderse. Vive aquí para que preview y exportación curven exactamente la
 * misma cadena.
 */
export const flattenCurvedText = (text: string, uppercase: boolean): string => {
  const flat = text.replace(/\n/g, '  ');
  return uppercase ? flat.toUpperCase() : flat;
};

export const computeCurvedText = (curvedTextInput: CurvedTextInput): CurvedTextGeometry => {
  const { text, fontSizePx, curve } = curvedTextInput;

  const glyphs = Math.max(text.length, 1);
  const width = Math.max(fontSizePx * GLYPH_WIDTH_RATIO * glyphs, fontSizePx * 2);
  const sag = (Math.abs(clamp(curve, -100, 100)) / 100) * width * SAG_RATIO;

  // Convexo: la curva sube por el centro y el arco necesita sitio ARRIBA, así
  // que la línea base baja. Cóncavo: se hunde y el sitio hace falta abajo.
  const isConvex = curve >= 0;
  const baselineY = isConvex ? fontSizePx * BASELINE_RATIO + sag : fontSizePx * BASELINE_RATIO;
  const controlY = isConvex ? baselineY - 2 * sag : baselineY + 2 * sag;
  const height =
    (isConvex ? baselineY : baselineY + 2 * sag) + fontSizePx * DESCENDER_RATIO;

  return {
    width,
    height,
    pathD: `M 0 ${baselineY} Q ${width / 2} ${controlY} ${width} ${baselineY}`,
    start: { x: 0, y: baselineY },
    control: { x: width / 2, y: controlY },
    end: { x: width, y: baselineY },
  };
};

/** Punto de la Bézier cuadrática en el parámetro `t` (0…1). */
const pointAt = (geometry: CurvedTextGeometry, t: number): CurvePoint => {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * geometry.start.x + 2 * inverse * t * geometry.control.x + t * t * geometry.end.x,
    y: inverse * inverse * geometry.start.y + 2 * inverse * t * geometry.control.y + t * t * geometry.end.y,
  };
};

/**
 * Tabla de longitudes acumuladas del arco. La Bézier no avanza a velocidad
 * constante con `t`: repartir los glifos por `t` los amontonaría en el centro,
 * así que se reparten por LONGITUD y esta tabla es la que traduce una de otra.
 */
const sampleCache = new WeakMap<CurvedTextGeometry, { points: CurvePoint[]; lengths: number[] }>();

const sampleCurve = (geometry: CurvedTextGeometry) => {
  // El muestreo se reaprovecha por geometría: se llama una vez por GLIFO y
  // rehacerlo cada vez multiplicaría el coste por la longitud del texto.
  const cached = sampleCache.get(geometry);
  if (cached) return cached;

  const points: CurvePoint[] = [];
  const lengths: number[] = [0];
  for (let index = 0; index <= CURVE_SAMPLES; index++) {
    points.push(pointAt(geometry, index / CURVE_SAMPLES));
    if (index > 0) {
      const previous = points[index - 1];
      const current = points[index];
      lengths.push(lengths[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y));
    }
  }

  const sampled = { points, lengths };
  sampleCache.set(geometry, sampled);
  return sampled;
};

/** Longitud total del arco, en px. */
export const curveLength = (geometry: CurvedTextGeometry): number => {
  const { lengths } = sampleCurve(geometry);
  return lengths[lengths.length - 1];
};

/**
 * Punto del arco a una distancia dada desde su inicio, con el ÁNGULO de la
 * tangente en radianes: es lo que necesita el canvas para girar cada glifo y
 * que "se apoye" sobre la curva, como hace `<textPath>` en el preview.
 */
export const pointAtDistance = (
  geometry: CurvedTextGeometry,
  distance: number,
): CurvePoint & { angle: number } => {
  const { points, lengths } = sampleCurve(geometry);
  const total = lengths[lengths.length - 1];
  const target = clamp(distance, 0, total);

  let index = 1;
  while (index < lengths.length - 1 && lengths[index] < target) index++;

  const segmentLength = lengths[index] - lengths[index - 1];
  const ratio = segmentLength > 0 ? (target - lengths[index - 1]) / segmentLength : 0;
  const from = points[index - 1];
  const to = points[index];

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
  };
};
