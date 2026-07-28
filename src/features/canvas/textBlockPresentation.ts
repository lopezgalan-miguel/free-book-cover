/** Deriva la presentación CSS del bloque sin estado ni efectos React. */
import { fontStackOf } from '@/features/fonts/catalog';
import { hexToRgba } from '@/utils/hex';
import type { TextBlock } from '@/types/editor';
import type { CSSProperties } from 'react';

interface TextBlockPresentationOptions {
  block: TextBlock;
  canvasWidthPx: number;
  editing: boolean;
  isDragging: boolean;
}

export const getTextBlockPresentation = ({
  block,
  canvasWidthPx,
  editing,
  isDragging,
}: TextBlockPresentationOptions) => {
  const fontSizePx = (block.fontSizePct / 100) * canvasWidthPx;
  const shadowFactor = block.shadowIntensity / 50;
  const shadowOffsetPx = (canvasWidthPx * 0.006 * shadowFactor).toFixed(2);
  const shadowBlurPx = (canvasWidthPx * 0.02 * shadowFactor + 1).toFixed(2);
  const shadowRgba = hexToRgba(block.shadowColor, block.shadowIntensity / 100);
  const outlineWidthPx = ((canvasWidthPx * block.outlineWidth) / 1400).toFixed(2);
  const hasExplicitBox = block.boxWidthPct != null && block.boxHeightPct != null;
  const texture = editing ? null : block.texture;

  const shellStyle: CSSProperties = {
    position: 'absolute',
    left: `${block.x}%`,
    top: `${block.y}%`,
    transform: 'translate(-50%, -50%)',
    width: hasExplicitBox ? `${block.boxWidthPct}%` : 'max-content',
    maxWidth: hasExplicitBox ? undefined : '100%',
    minWidth: hasExplicitBox ? undefined : 32,
    minHeight: hasExplicitBox ? `${block.boxHeightPct}%` : undefined,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems:
      block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center',
    cursor: isDragging ? 'grabbing' : editing ? 'text' : 'grab',
    touchAction: 'none',
    userSelect: editing ? 'text' : 'none',
    overflow: 'visible',
    WebkitTapHighlightColor: 'transparent',
  };

  const textStyle: CSSProperties = {
    fontFamily: fontStackOf(block.fontFamily),
    fontWeight: block.fontWeight,
    fontSize: `${fontSizePx}px`,
    fontStyle: block.italic ? 'italic' : 'normal',
    textDecoration: block.underline ? 'underline' : 'none',
    textTransform: block.uppercase ? 'uppercase' : 'none',
    color: block.color,
    WebkitTextFillColor: texture ? 'transparent' : undefined,
    letterSpacing: `${block.letterSpacing}em`,
    lineHeight: block.lineHeight,
    textAlign: block.align,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
    cursor: 'text',
    pointerEvents: 'auto',
    width: '100%',
    outline: 'none',
    caretColor: block.color,
    textShadow: block.shadow
      ? `${shadowOffsetPx}px ${shadowOffsetPx}px ${shadowBlurPx}px ${shadowRgba}`
      : undefined,
    WebkitTextStroke: block.outline ? `${outlineWidthPx}px ${block.outlineColor}` : undefined,
    paintOrder: 'stroke fill',
  };

  const textureLayerStyle: CSSProperties | null = texture && {
    ...textStyle,
    position: 'absolute',
    inset: 0,
    cursor: 'default',
    pointerEvents: 'none',
    textShadow: undefined,
    WebkitTextStroke: undefined,
    backgroundImage: `url(${JSON.stringify(texture.src)})`,
    backgroundSize: texture.fit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    opacity: texture.opacity / 100,
  };

  return {
    curved: !editing && block.curve !== 0,
    fontSizePx,
    shellStyle,
    textStyle,
    textureLayerStyle,
  };
};
