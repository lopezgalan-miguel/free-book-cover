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

export function Toggle(_props: ToggleProps) {
  return null;
}
