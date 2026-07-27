/**
 * CONTRATO · Toggle (primitiva reutilizable)
 * ------------------------------------------
 * Interruptor on/off accesible, reutilizado para activar sombra, contorno, y
 * cualquier opción booleana. Controlado por props, sin estado interno.
 *
 * Cómo lo hace: recibe `checked` y notifica con `onChange`. `label` es su
 * nombre accesible; el texto visible lo pone quien lo coloca, en su fila.
 *
 * No usa `Button`: un interruptor es `role="switch"`, no un botón con etiqueta,
 * y su caja no se parece a ninguna variante de `Button`.
 */

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Toggle = ({ label, checked, onChange }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-5 w-9 cursor-pointer rounded-full border-none ${
      checked ? 'bg-accent' : 'bg-line'
    }`}
  >
    <span
      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm ${
        checked ? 'left-[18px]' : 'left-1'
      }`}
    />
  </button>
);
