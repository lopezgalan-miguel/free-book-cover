/**
 * CONTRATO · renderToCanvas
 * -------------------------
 * Pinta el proyecto (imagen de fondo + todos los bloques de texto) sobre un
 * <canvas> a la RESOLUCIÓN REAL de salida (`size` en px), no a la del preview.
 * Es la pieza clave de "exportar sin perder calidad": el preview en pantalla es
 * una vista escalada; la exportación se rasteriza aquí a tamaño completo.
 *
 * Cómo lo hace:
 *  1. Crea un canvas de `size.width × size.height`.
 *  2. Dibuja la imagen de fondo respetando `fit`/offset (cover/contain).
 *  3. Recorre `blocks` y pinta cada uno con su tipografía, color, sombra,
 *     contorno, textura y alineación. El texto curvo delega en `curvedText.ts`.
 *  4. Convierte % → px usando el ancho real, de modo que el resultado sea
 *     idéntico proporcionalmente a lo que se ve en el preview.
 *
 * Las tipografías las carga él mismo (`ensureFontsLoaded`) antes de pintar: el
 * navegador solo descarga una familia cuando el DOM la usa, y aquí se pinta en
 * un canvas, así que esperar a `document.fonts.ready` sin pedirlas no basta.
 *
 * Decisiones que separan la exportación del preview:
 *  - El lienzo SIN imagen se exporta con un color base liso, no con las rayas
 *    del preview: esas rayas son el aviso de "aquí falta una imagen", del mismo
 *    grupo que el marco de selección o el texto de ayuda, y nada de eso se
 *    exporta.
 *  - La textura del texto no existe en Canvas 2D (`background-clip: text` es
 *    solo CSS): se reproduce pintando los glifos en un canvas intermedio del
 *    tamaño del bloque y componiendo la imagen con `source-in`, que recorta la
 *    imagen a la silueta de las letras. La opacidad se aplica al pegar ese
 *    canvas, no a la sombra ni al contorno, igual que en el preview.
 *
 * Devuelve el HTMLCanvasElement listo para que `exporters.ts` lo serialice.
 */

import {
  computeCurvedText,
  curveLength,
  flattenCurvedText,
  pointAtDistance,
} from './curvedText';
import { fontStackOf } from '@/features/fonts/catalog';
import type { BlockTexture, EditorState, ImageFit, TextBlock } from '@/types/editor';
import { hexToRgba } from '@/utils/hex';

/** Color del lienzo cuando el proyecto no tiene imagen de fondo. */
const BASE_COLOR = '#3D382F';
/** Color bajo la imagen: se ve en las bandas que deja el encaje 'contain'. */
const MATTE_COLOR = '#100E0B';

export interface RenderInput {
  blocks: EditorState['blocks'];
  image: EditorState['image'];
  size: EditorState['size'];
}

/**
 * Fuerza la carga de las tipografías que usan los bloques. `document.fonts`
 * solo descarga una familia cuando el DOM la pinta, y aquí se pinta en un
 * canvas: sin este paso, un bloque cuya fuente no esté ya en pantalla se
 * exportaría con la de sustitución (y el usuario descubriría la portada
 * cambiada al abrir el fichero). Una familia que falle no detiene el export:
 * ese bloque saldrá con el respaldo, exactamente igual que en el preview.
 */
const ensureFontsLoaded = async (blocks: EditorState['blocks']): Promise<void> => {
  if (!('fonts' in document)) return;
  await Promise.all(
    blocks.map((block) =>
      document.fonts
        .load(`${block.italic ? 'italic ' : ''}${block.fontWeight} 64px ${fontStackOf(block.fontFamily)}`)
        .catch(() => []),
    ),
  );
  await document.fonts.ready;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const element = new Image();
    element.decoding = 'sync';
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`renderToCanvas: no se pudo cargar ${src}`));
    element.src = src;
  });

/**
 * Rectángulo donde cae una imagen dentro de una caja, replicando
 * `background-size` + `background-position` de CSS: `cover` recorta y
 * `contain` deja banda, y el offset (0–100 %) alinea el mismo punto de la
 * imagen con el de la caja.
 */
const fitRect = (
  imageSize: { width: number; height: number },
  boxSize: { width: number; height: number },
  fit: ImageFit,
  offsetXPct: number,
  offsetYPct: number,
) => {
  const scaleToCover = Math.max(boxSize.width / imageSize.width, boxSize.height / imageSize.height);
  const scaleToContain = Math.min(
    boxSize.width / imageSize.width,
    boxSize.height / imageSize.height,
  );
  const scale = fit === 'contain' ? scaleToContain : scaleToCover;
  const width = imageSize.width * scale;
  const height = imageSize.height * scale;

  return {
    x: (boxSize.width - width) * (offsetXPct / 100),
    y: (boxSize.height - height) * (offsetYPct / 100),
    width,
    height,
  };
};

/** Tipografía del bloque como valor de `ctx.font`. */
const fontOf = (block: TextBlock, fontSizePx: number): string =>
  `${block.italic ? 'italic ' : ''}${block.fontWeight} ${fontSizePx}px ${fontStackOf(
    block.fontFamily,
  )}`;

/**
 * Prepara el contexto para pintar un bloque. `letterSpacing` es reciente en
 * Canvas 2D: donde no exista se pinta sin espaciado en vez de romper el
 * export, y se avisa en el propio código porque el resultado difiere del
 * preview.
 */
const applyTextStyle = (
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  fontSizePx: number,
): void => {
  ctx.font = fontOf(block, fontSizePx);
  const spacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in ctx) spacing.letterSpacing = `${block.letterSpacing * fontSizePx}px`;
};

/** Sombra del bloque con las mismas fórmulas que el preview. */
const applyShadow = (
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  canvasWidth: number,
): void => {
  const factor = block.shadowIntensity / 50;
  ctx.shadowColor = hexToRgba(block.shadowColor, block.shadowIntensity / 100);
  ctx.shadowOffsetX = canvasWidth * 0.006 * factor;
  ctx.shadowOffsetY = canvasWidth * 0.006 * factor;
  ctx.shadowBlur = canvasWidth * 0.02 * factor + 1;
};

const clearShadow = (ctx: CanvasRenderingContext2D): void => {
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;
};

/**
 * Grosor del contorno. El preview usa `-webkit-text-stroke`, que solo enseña
 * la mitad exterior del trazo; `strokeText` lo centra igual, así que el doble
 * de grosor deja el mismo resultado a la vista.
 */
const outlineWidthOf = (block: TextBlock, canvasWidth: number): number =>
  ((canvasWidth * block.outlineWidth) / 1400) * 2;

/** Parte el texto en líneas respetando los `\n` y el ancho del marco. */
const layoutLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  return text.split('\n').flatMap((paragraph) => {
    const words = paragraph.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      // Una palabra sola más ancha que el marco se queda en su línea: partirla
      // por letras sería peor que desbordar un poco.
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }

    lines.push(current);
    return lines;
  });
};

/** Caja y anclajes de un bloque de texto recto, en px del lienzo real. */
interface BlockLayout {
  lines: string[];
  lineHeightPx: number;
  /** Caja del bloque: es a ella a la que se ajusta la textura. */
  box: { x: number; y: number; width: number; height: number };
  /** Coordenada X a la que se alinea el texto, según `align`. */
  anchorX: number;
  /** Y de la primera línea (con `textBaseline = 'middle'`). */
  firstLineY: number;
}

const layoutBlock = (
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  size: EditorState['size'],
  fontSizePx: number,
): BlockLayout => {
  const text = block.uppercase ? block.text.toUpperCase() : block.text;
  const boxWidthPx = block.boxWidthPct != null ? (block.boxWidthPct / 100) * size.width : null;
  // Sin marco explícito el bloque se auto-ajusta al texto, pero el preview lo
  // limita a `maxWidth: 100%`: envuelve al llegar al borde del lienzo en vez de
  // desbordar. Aquí el límite es el mismo, o el export sacaría el texto fuera.
  const lines = layoutLines(ctx, text, boxWidthPx ?? size.width);

  const lineHeightPx = fontSizePx * block.lineHeight;
  const widest = lines.reduce((widestSoFar, line) => {
    return Math.max(widestSoFar, ctx.measureText(line).width);
  }, 0);
  const boxWidth = boxWidthPx ?? widest;
  const boxHeight = lines.length * lineHeightPx;

  const centerX = (block.x / 100) * size.width;
  const centerY = (block.y / 100) * size.height;
  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;

  return {
    lines,
    lineHeightPx,
    box: { x: boxX, y: boxY, width: boxWidth, height: boxHeight },
    anchorX: block.align === 'left' ? boxX : block.align === 'right' ? boxX + boxWidth : centerX,
    firstLineY: boxY + lineHeightPx / 2,
  };
};

/** Subrayado: Canvas 2D no tiene `text-decoration`, se traza a mano. */
const drawUnderlines = (
  ctx: CanvasRenderingContext2D,
  layout: BlockLayout,
  fontSizePx: number,
  align: TextBlock['align'],
): void => {
  const thickness = Math.max(fontSizePx / 18, 1);
  layout.lines.forEach((line, index) => {
    const width = ctx.measureText(line).width;
    const x =
      align === 'left'
        ? layout.anchorX
        : align === 'right'
          ? layout.anchorX - width
          : layout.anchorX - width / 2;
    const y = layout.firstLineY + index * layout.lineHeightPx + fontSizePx * 0.34;
    ctx.fillRect(x, y, width, thickness);
  });
};

/**
 * Pinta el relleno con una textura: los glifos van a un canvas intermedio del
 * tamaño del bloque y `source-in` recorta la imagen a su silueta. `paintGlyphs`
 * recibe el contexto intermedio ya trasladado, así que el llamante pinta con
 * las MISMAS coordenadas del lienzo y no tiene que duplicar la colocación.
 */
const drawTexturedFill = (
  ctx: CanvasRenderingContext2D,
  paintGlyphs: (target: CanvasRenderingContext2D) => void,
  box: { x: number; y: number; width: number; height: number },
  textureImage: HTMLImageElement,
  texture: BlockTexture,
  fontSizePx: number,
): void => {
  // Los glifos se salen de la caja de línea (tildes, descendentes, contorno):
  // sin margen, el canvas intermedio los recortaría.
  const padding = fontSizePx;
  const width = Math.ceil(box.width + padding * 2);
  const height = Math.ceil(box.height + padding * 2);
  if (width <= 0 || height <= 0) return;

  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext('2d');
  if (!layerCtx) return;

  layerCtx.translate(-(box.x - padding), -(box.y - padding));
  layerCtx.fillStyle = '#FFFFFF';
  paintGlyphs(layerCtx);

  // La imagen se encaja en la CAJA del bloque, no en el canvas intermedio: el
  // margen es sitio para los glifos, no parte del área de la textura. `fitRect`
  // devuelve la posición DENTRO de la caja, así que se suma el origen de esta
  // para acabar en coordenadas del lienzo, que son en las que quedó el
  // contexto tras el `translate`.
  layerCtx.globalCompositeOperation = 'source-in';
  const rect = fitRect(
    { width: textureImage.naturalWidth, height: textureImage.naturalHeight },
    { width: box.width, height: box.height },
    texture.fit,
    50,
    50,
  );
  layerCtx.drawImage(textureImage, box.x + rect.x, box.y + rect.y, rect.width, rect.height);

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = texture.opacity / 100;
  ctx.drawImage(layer, box.x - padding, box.y - padding);
  ctx.globalAlpha = previousAlpha;
};

/** Pinta un bloque de texto recto (`curve === 0`). */
const drawStraightBlock = (
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  size: EditorState['size'],
  fontSizePx: number,
  textureImage: HTMLImageElement | null,
): void => {
  const layout = layoutBlock(ctx, block, size, fontSizePx);

  ctx.textAlign = block.align === 'left' ? 'left' : block.align === 'right' ? 'right' : 'center';
  ctx.textBaseline = 'middle';

  const paintLines = (paint: (line: string, x: number, y: number) => void) => {
    layout.lines.forEach((line, index) => {
      paint(line, layout.anchorX, layout.firstLineY + index * layout.lineHeightPx);
    });
  };

  // La sombra la proyecta la PRIMERA pasada que dibuja la silueta; si se
  // dejase puesta, el relleno sobre el contorno la duplicaría.
  if (block.shadow) applyShadow(ctx, block, size.width);

  if (block.outline) {
    ctx.strokeStyle = block.outlineColor;
    ctx.lineWidth = outlineWidthOf(block, size.width);
    ctx.lineJoin = 'round';
    paintLines((line, x, y) => ctx.strokeText(line, x, y));
    clearShadow(ctx);
  }

  if (textureImage && block.texture) {
    drawTexturedFill(
      ctx,
      (layerCtx) => {
        applyTextStyle(layerCtx, block, fontSizePx);
        layerCtx.textAlign = ctx.textAlign;
        layerCtx.textBaseline = ctx.textBaseline;
        paintLines((line, x, y) => layerCtx.fillText(line, x, y));
        if (block.underline) drawUnderlines(layerCtx, layout, fontSizePx, block.align);
      },
      layout.box,
      textureImage,
      block.texture,
      fontSizePx,
    );
    clearShadow(ctx);
    return;
  }

  ctx.fillStyle = block.color;
  paintLines((line, x, y) => ctx.fillText(line, x, y));
  if (block.underline) drawUnderlines(ctx, layout, fontSizePx, block.align);
  clearShadow(ctx);
};

/** Pinta un bloque curvo repartiendo los glifos sobre el arco. */
const drawCurvedBlock = (
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  size: EditorState['size'],
  fontSizePx: number,
  textureImage: HTMLImageElement | null,
): void => {
  const text = flattenCurvedText(block.text, block.uppercase);
  const geometry = computeCurvedText({ text, fontSizePx, curve: block.curve });
  const total = curveLength(geometry);

  const originX = (block.x / 100) * size.width - geometry.width / 2;
  const originY = (block.y / 100) * size.height - geometry.height / 2;

  // Centrado sobre el arco, como el `startOffset="50%"` del preview.
  const textWidth = ctx.measureText(text).width;
  const startDistance = (total - textWidth) / 2;

  /** Recorre los glifos colocando cada uno sobre su punto del arco. */
  const paintGlyphs = (
    target: CanvasRenderingContext2D,
    paint: (glyph: string) => void,
  ) => {
    let advance = 0;
    for (const glyph of text) {
      const glyphWidth = target.measureText(glyph).width;
      const point = pointAtDistance(geometry, startDistance + advance + glyphWidth / 2);
      target.save();
      target.translate(originX + point.x, originY + point.y);
      target.rotate(point.angle);
      paint(glyph);
      target.restore();
      advance += glyphWidth;
    }
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (block.shadow) applyShadow(ctx, block, size.width);

  if (block.outline) {
    ctx.strokeStyle = block.outlineColor;
    ctx.lineWidth = outlineWidthOf(block, size.width);
    ctx.lineJoin = 'round';
    paintGlyphs(ctx, (glyph) => ctx.strokeText(glyph, 0, 0));
    clearShadow(ctx);
  }

  const box = {
    x: originX,
    y: originY,
    width: geometry.width,
    height: geometry.height,
  };

  if (textureImage && block.texture) {
    drawTexturedFill(
      ctx,
      (layerCtx) => {
        applyTextStyle(layerCtx, block, fontSizePx);
        layerCtx.textAlign = 'center';
        layerCtx.textBaseline = 'alphabetic';
        paintGlyphs(layerCtx, (glyph) => layerCtx.fillText(glyph, 0, 0));
      },
      box,
      textureImage,
      block.texture,
      fontSizePx,
    );
    clearShadow(ctx);
    return;
  }

  ctx.fillStyle = block.color;
  paintGlyphs(ctx, (glyph) => ctx.fillText(glyph, 0, 0));
  clearShadow(ctx);
};

export const renderToCanvas = async (renderInput: RenderInput): Promise<HTMLCanvasElement> => {
  const { blocks, image, size } = renderInput;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(Math.round(size.width), 1);
  canvas.height = Math.max(Math.round(size.height), 1);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderToCanvas: el navegador no da contexto 2D');

  // Todo lo que necesita red/disco se resuelve ANTES de pintar: el dibujo es
  // síncrono y así el orden de las capas no depende de qué imagen llegue antes.
  await ensureFontsLoaded(blocks);
  const backgroundImage = image ? await loadImage(image.src) : null;
  const textureEntries = await Promise.all(
    blocks
      .filter((block) => block.texture)
      .map(async (block) => [block.id, await loadImage(block.texture!.src)] as const),
  );
  const texturesByBlock = new Map(textureEntries);

  ctx.fillStyle = image ? MATTE_COLOR : BASE_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (image && backgroundImage) {
    const rect = fitRect(
      { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight },
      { width: canvas.width, height: canvas.height },
      image.fit,
      image.offsetX,
      image.offsetY,
    );
    ctx.drawImage(backgroundImage, rect.x, rect.y, rect.width, rect.height);
  }

  // Las medidas de salida son las del canvas ya redondeado: si el layout se
  // calculase con `size` sin redondear, el texto quedaría medio píxel movido
  // respecto al fondo.
  const outputSize = { width: canvas.width, height: canvas.height };

  for (const block of blocks) {
    const fontSizePx = (block.fontSizePct / 100) * canvas.width;
    if (fontSizePx <= 0) continue;

    ctx.save();
    applyTextStyle(ctx, block, fontSizePx);
    const textureImage = texturesByBlock.get(block.id) ?? null;

    if (block.curve === 0) {
      drawStraightBlock(ctx, block, outputSize, fontSizePx, textureImage);
    } else {
      drawCurvedBlock(ctx, block, outputSize, fontSizePx, textureImage);
    }
    ctx.restore();
  }

  return canvas;
};
