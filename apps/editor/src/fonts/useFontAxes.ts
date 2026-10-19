import { useEffect, useState } from "react";
import { readFontAxes, type FontAxis, type Project } from "@free-book-cover/core";
import type { StoredAsset } from "../storage/projectStorage";

const cache = new WeakMap<Blob, FontAxis[] | null>();
const readBlob = (b: Blob): Promise<ArrayBuffer> => (typeof b.arrayBuffer === "function" ? b.arrayBuffer() : new Response(b).arrayBuffer());

// Ejes de variación de una fuente subida al proyecto, leídos de su archivo (con caché por archivo).
// null si la familia no es una subida, aún se está leyendo o la fuente no es variable.
export function useFontAxes(doc: Project, stored: readonly StoredAsset[], family: string | undefined): FontAxis[] | null {
  const asset = family === undefined ? undefined : doc.assets.find((a) => a.kind === "font" && a.metadata.family === family);
  const blob = asset ? stored.find((s) => s.id === asset.id)?.blob : undefined;
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!blob || cache.has(blob)) return;
    let live = true;
    readBlob(blob).then(
      (data) => {
        cache.set(blob, readFontAxes(new Uint8Array(data)));
        if (live) setVersion((v) => v + 1);
      },
      () => cache.set(blob, null),
    );
    return () => {
      live = false;
    };
  }, [blob]);
  return blob ? (cache.get(blob) ?? null) : null;
}
