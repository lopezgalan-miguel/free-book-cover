import { GeometryPanel } from "../panels/GeometryPanel";
import { ImagePanel } from "../panels/ImagePanel";
import { ShapePanel } from "../panels/ShapePanel";
import { TextPanel } from "../panels/TextPanel";

// Texto seleccionado: panel de tipografía completo; forma: relleno y borde; imagen: filtros; debajo, posición y tamaño.
export function RightPanel() {
  return (
    <>
      <TextPanel />
      <ShapePanel />
      <ImagePanel />
      <div className="border-t border-line-soft p-4">
        <GeometryPanel />
      </div>
    </>
  );
}
