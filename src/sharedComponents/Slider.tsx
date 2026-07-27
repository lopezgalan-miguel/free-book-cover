/**
 * CONTRATO · Slider (primitiva reutilizable)
 * ------------------------------------------
 * Control deslizante etiquetado y controlado, reutilizado en todos los paneles
 * (tamaño, interlineado, espaciado, curvatura, intensidad de sombra…).
 * Muestra una etiqueta a la izquierda y el valor actual formateado a la derecha.
 *
 * Cómo lo hace:
 *  - Es controlado: recibe `value` y notifica cambios con `onChange`.
 *  - Sin estado propio ni lógica de dominio; sirve para cualquier rango.
 *  - No lleva margen exterior: la separación entre controles la pone quien
 *    los coloca, no el control.
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

export const Slider = ({
  label,
  value,
  min,
  max,
  step = 1,
  valueLabel,
  onChange,
}: SliderProps) => (
  <div>
    <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
      <span>{label}</span>
      <span className="font-mono text-[11px] text-muted">{valueLabel ?? value}</span>
    </div>
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-2 w-full cursor-pointer rounded-lg bg-line accent-accent"
    />
  </div>
);
