import sharp from "sharp";

/** Cubierta de prueba: bloques de color saturado, grises y negro puro. */
export async function sampleCover(widthIn: number, heightIn: number, ppi: number, alpha = false) {
  const width = Math.round(widthIn * ppi);
  const height = Math.round(heightIn * ppi);
  const colors = ["#e63946", "#2a9d8f", "#264653", "#f4a261", "#1d3557", "#000000", "#808080", "#ffffff"];
  const bw = Math.floor(width / colors.length);
  const blocks = await Promise.all(
    colors.map(async (background, i) => ({
      input: await sharp({ create: { width: bw, height: Math.floor(height / 2), channels: 3, background } }).png().toBuffer(),
      left: i * bw,
      top: Math.floor(height / 4),
    })),
  );
  const composed = await sharp({
    create: { width, height, channels: 4, background: { r: 250, g: 248, b: 244, alpha: alpha ? 0.5 : 1 } },
  })
    .composite(blocks)
    .png()
    .toBuffer();
  // composite siempre deja canal alfa; se elimina salvo que se pida.
  return alpha ? composed : sharp(composed).removeAlpha().png().toBuffer();
}
