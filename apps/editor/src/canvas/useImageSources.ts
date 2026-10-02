import { useEffect, useMemo, useState } from "react";
import { assetDims, type Asset } from "@free-book-cover/core";
import { thumbId } from "../images/importImage";
import type { StoredAsset } from "../storage/projectStorage";
import type { ImageSource, ImageSources } from "./scene";

// URL de objeto de la miniatura (o del original si no hay) de un recurso, liberada al desmontar.
export function useAssetUrl(assets: StoredAsset[], assetId: string | null): string | null {
  const blob = useMemo(
    () => (assetId ? (assets.find((a) => a.id === thumbId(assetId)) ?? assets.find((a) => a.id === assetId))?.blob ?? null : null),
    [assets, assetId],
  );
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== "function") return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

// Decodifica los recursos de imagen del documento para la vista previa (miniatura si existe).
export function useImageSources(docAssets: Asset[], stored: StoredAsset[]): ImageSources {
  const [sources, setSources] = useState<ImageSources>(new Map());
  const key = docAssets.filter((a) => a.kind === "image").map((a) => a.id).join("|");
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const next: ImageSources = new Map();
    const jobs = docAssets
      .filter((a) => a.kind === "image")
      .map(async (a) => {
        const thumb = stored.find((s) => s.id === thumbId(a.id));
        const blob = (thumb ?? stored.find((s) => s.id === a.id))?.blob;
        const dims = assetDims(a);
        if (!blob || !dims) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const img = new Image();
        img.src = url;
        try {
          await img.decode();
        } catch {
          return;
        }
        const entry: ImageSource = { image: img, scale: img.naturalWidth / dims.widthPx };
        next.set(a.id, entry);
      });
    void Promise.all(jobs).then(() => {
      if (!cancelled) setSources(next);
    });
    return () => {
      cancelled = true;
      // Las URL se liberan cuando ya no hay objetos Fabric que las usen (al siguiente conjunto).
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000);
    };
    // Se re-decodifica solo si cambia el conjunto de recursos (los blobs son inmutables por id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stored.length]);
  return sources;
}
