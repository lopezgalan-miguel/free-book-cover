import { BackgroundPanel } from "../panels/BackgroundPanel";
import { CanvasPanel } from "../panels/CanvasPanel";
import { LayersPanel } from "../panels/LayersPanel";
import { KdpPanel } from "../panels/KdpPanel";
import { VariantsPanel } from "../panels/VariantsPanel";

// Contenido del panel izquierdo; el contenedor (aside, ancho) lo pone el layout.
export function LeftPanel() {
  return (
    <>
      <BackgroundPanel />
      <CanvasPanel />
      <KdpPanel />
      <LayersPanel />
      <VariantsPanel />
    </>
  );
}
