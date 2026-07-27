/**
 * CONTRATO · Button (primitiva reutilizable)
 * ------------------------------------------
 * Botón base de toda la interfaz. Unifica las tres formas que se repetían
 * copiadas por los paneles: la acción de acento (Exportar), el cuadrado o la
 * ficha con borde que puede estar seleccionada (B/I/U, alineación, presets) y
 * el botón de texto plano (Hecho, Exportar en móvil, eliminar capa).
 *
 * Cómo lo hará:
 *  - Extiende el `<button>` nativo, así que `onClick`, `title`, `disabled` o
 *    `aria-*` pasan tal cual y el contenido va como `children`.
 *  - `variant` decide el color; `size`, la caja. `isActive` marca el estado
 *    seleccionado (acento) y publica `aria-pressed` para lectores de pantalla.
 *  - Nace con `type="button"`: ningún botón del editor envía formularios salvo
 *    que lo pida explícitamente.
 *
 * Regla al ampliarlo: el componente NUNCA emite una utilidad de Tailwind que
 * pueda chocar con otra que pase quien lo usa, porque en un conflicto no gana
 * la última del atributo `class` sino la que la hoja de estilos ponga después.
 * De ahí el reparto: `primary`, `ghost` y `danger` tienen tipografía y color
 * fijos porque su identidad es fija; `outline` solo pone borde y fondo, y cada
 * llamada decide el tamaño y el color de su texto (a muchos sitios les hace
 * falta uno distinto: acento en "añadir capa", gris en los estilos de texto).
 *
 * Lo que NO cubre, por no ser "un botón con etiqueta": las pestañas de `Home`,
 * las filas de `FontPanel`, las muestras de `ColorPanel` y los segmentos de
 * `LanguageSwitcher`. Cada uno tiene su propia estructura y estado.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'icon' | 'iconSm' | 'none';

/** Colores por variante, en reposo y seleccionada. */
const VARIANT_CLASS: Record<ButtonVariant, { base: string; active: string }> = {
  primary: {
    base: 'border border-transparent bg-accent text-sm font-semibold text-panel hover:bg-accent-strong',
    active: '',
  },
  outline: {
    base: 'border border-line bg-white hover:border-accent',
    active: 'border border-accent bg-accent-tint',
  },
  ghost: {
    base: 'border-none bg-transparent text-sm font-semibold text-accent-strong',
    active: '',
  },
  danger: {
    base: 'border-none bg-transparent text-muted hover:text-danger',
    active: '',
  },
};

/** Caja por tamaño. `none` deja el botón sin relleno (texto suelto). */
const SIZE_CLASS: Record<ButtonSize, string> = {
  md: 'px-4 py-2',
  sm: 'px-2 py-1.5',
  icon: 'flex h-8 w-8 items-center justify-center',
  iconSm: 'flex h-6 w-6 items-center justify-center',
  none: '',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Estado seleccionado. Solo `outline` lo representa visualmente. */
  isActive?: boolean;
  children?: ReactNode;
}

export const Button = ({
  variant = 'outline',
  size = 'md',
  isActive = false,
  className = '',
  type = 'button',
  children,
  ...buttonProps
}: ButtonProps) => {
  const colors = VARIANT_CLASS[variant];
  const tone = isActive && colors.active ? colors.active : colors.base;

  return (
    <button
      {...buttonProps}
      type={type}
      aria-pressed={isActive || undefined}
      className={`cursor-pointer rounded-lg transition-colors ${tone} ${SIZE_CLASS[size]} ${className}`}
    >
      {children}
    </button>
  );
};
