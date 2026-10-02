import { BackgroundPanel } from "../panels/BackgroundPanel";
import { CanvasPanel } from "../panels/CanvasPanel";
import { LayersPanel } from "../panels/LayersPanel";

// Contenido del panel izquierdo; el contenedor (aside, ancho) lo pone el layout.
export function LeftPanel() {
  return (
    <>
      <BackgroundPanel />
      <CanvasPanel />
      <LayersPanel />
    </>
  );
}
