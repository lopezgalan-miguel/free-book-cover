/**
 * CONTRATO · CurvedTextView (texto curvo del preview)
 * ---------------------------------------------------
 * Pinta UN bloque con `curve !== 0` como SVG `<textPath>` sobre el arco que
 * calcula `core/curvedText`. Es la otra mitad de `TextBlock`: el texto recto va
 * en DOM (editable) y el curvo aquí, porque un arco no se puede expresar con
 * CSS y `<textPath>` sí lo hace de forma vectorial y fiel a la exportación.
 *
 * Cómo lo hace:
 *  - La geometría (anchura, altura y path) sale de `computeCurvedText`, la
 *    misma que usa `renderToCanvas`: preview y exportación no pueden discrepar.
 *  - Un arco es UNA línea: el salto de línea se convierte en espacio doble
 *    (`flattenCurvedText`), no se pierde ni parte el texto.
 *  - Sombra, contorno y textura replican al texto recto: la sombra es un
 *    `drop-shadow` con el mismo desplazamiento y desenfoque, el contorno un
 *    `stroke` bajo el relleno (`paint-order`) y la textura un `<pattern>` con
 *    su encaje y su opacidad.
 *  - Es de presentación pura: no muta el store ni gestiona eventos; la
 *    selección y el arrastre siguen siendo del `TextBlock` que lo envuelve.
 */

import {
  computeCurvedText,
  flattenCurvedText,
} from '@/core/curvedText';
import { fontStackOf } from '@/features/fonts/catalog';
import type { TextBlock as TextBlockModel } from '@/types/editor';
import { hexToRgba } from '@/utils/hex';

export interface CurvedTextViewProps {
  block: TextBlockModel;
  /** Ancho del lienzo en px de pantalla: escala sombra y contorno. */
  canvasWidthPx: number;
  fontSizePx: number;
}

export const CurvedTextView = ({ block, canvasWidthPx, fontSizePx }: CurvedTextViewProps) => {
  const text = flattenCurvedText(block.text, block.uppercase);
  const geometry = computeCurvedText({ text, fontSizePx, curve: block.curve });

  const pathId = `curve-${block.id}`;
  const patternId = `texture-${block.id}`;

  const shadowFactor = block.shadowIntensity / 50;
  const shadowOffsetPx = canvasWidthPx * 0.006 * shadowFactor;
  const shadowBlurPx = canvasWidthPx * 0.02 * shadowFactor + 1;
  // El contorno recto es un `-webkit-text-stroke`, que solo enseña la mitad de
  // su grosor; el `stroke` del SVG va centrado en el trazo, así que necesita el
  // doble para verse igual de grueso.
  const outlineWidthPx = (canvasWidthPx * block.outlineWidth) / 1400;

  return (
    <svg
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      style={{ overflow: 'visible', display: 'block', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        <path id={pathId} d={geometry.pathD} fill="none" />
        {block.texture && (
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={geometry.width}
            height={geometry.height}
          >
            <image
              href={block.texture.src}
              x={0}
              y={0}
              width={geometry.width}
              height={geometry.height}
              preserveAspectRatio={
                block.texture.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'
              }
              opacity={block.texture.opacity / 100}
            />
          </pattern>
        )}
      </defs>

      <text
        fontFamily={fontStackOf(block.fontFamily)}
        fontSize={fontSizePx}
        fontWeight={block.fontWeight}
        fontStyle={block.italic ? 'italic' : 'normal'}
        textDecoration={block.underline ? 'underline' : undefined}
        letterSpacing={`${block.letterSpacing * fontSizePx}px`}
        textAnchor="middle"
        fill={block.texture ? `url(#${patternId})` : block.color}
        stroke={block.outline ? block.outlineColor : undefined}
        strokeWidth={block.outline ? outlineWidthPx * 2 : undefined}
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{
          filter: block.shadow
            ? `drop-shadow(${shadowOffsetPx}px ${shadowOffsetPx}px ${shadowBlurPx}px ${hexToRgba(
                block.shadowColor,
                block.shadowIntensity / 100,
              )})`
            : undefined,
        }}
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {text}
        </textPath>
      </text>
    </svg>
  );
};
