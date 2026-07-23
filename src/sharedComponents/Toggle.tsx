/**
 * CONTRATO · Toggle (primitiva reutilizable)
 * ------------------------------------------
 * Interruptor on/off accesible, reutilizado para activar sombra, contorno, y
 * cualquier opción booleana. Controlado por props, sin estado interno.
 *
 * Cómo lo hará: recibe `checked` y notifica con `onChange`. Expone `label` para
 * accesibilidad (aria) y opcionalmente muestra un texto asociado.
 */

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Toggle = (toggleProps: ToggleProps) => {
  void toggleProps; // stub: la firma ya es definitiva, el cuerpo llega en la Fase 2
  return null;
};
