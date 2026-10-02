import type { FontProblem } from "@free-book-cover/core";

// «700», «400 cursiva»... para los avisos de caras inexistentes.
export const facesText = (p: FontProblem, italicWord = "i"): string =>
  (p.faces ?? []).map((f) => `${f.weight}${f.italic ? italicWord : ""}`).join(", ");
