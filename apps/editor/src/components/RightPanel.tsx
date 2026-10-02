import { GeometryPanel } from "../panels/GeometryPanel";
import { TextPanel } from "../panels/TextPanel";

// Texto seleccionado: panel de tipografía completo y, debajo, posición y tamaño.
export function RightPanel() {
  return (
    <>
      <TextPanel />
      <div className="border-t border-line-soft p-4">
        <GeometryPanel />
      </div>
    </>
  );
}
