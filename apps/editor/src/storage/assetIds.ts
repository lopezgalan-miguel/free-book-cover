// Convención de nombres de los blobs guardados: el original y su miniatura derivada.
export const thumbId = (assetId: string) => `${assetId}.thumb`;
// Recurso al que pertenece un blob guardado (el original o su miniatura derivada).
export const baseAssetId = (blobId: string) => (blobId.endsWith(".thumb") ? blobId.slice(0, -".thumb".length) : blobId);
