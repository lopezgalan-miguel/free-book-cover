/**
 * CONTRATO · Slider (primitiva reutilizable)
 * ------------------------------------------
 * Control deslizante etiquetado y controlado, reutilizado en todos los paneles
 * (tamaño, interlineado, espaciado, curvatura, intensidad de sombra…).
 * Muestra una etiqueta a la izquierda y el valor actual formateado a la derecha.
 *
 * Cómo lo hará:
 *  - Es controlado: recibe `value` y notifica cambios con `onChange`.
 *  - Sin estado propio ni lógica de dominio; sirve para cualquier rango.
 */

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Texto del valor a mostrar (p.ej. "1.20 em"); por defecto el número. */
  valueLabel?: string;
  onChange: (value: number) => void;
}

export function Slider(_props: SliderProps) {
  return null;
}
