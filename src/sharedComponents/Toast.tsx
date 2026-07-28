/**
 * CONTRATO · Toast (aviso efímero reutilizable)
 * ---------------------------------------------
 * Mensaje breve que aparece abajo y centrado para confirmar que algo ha salido
 * bien (o mal) sin interrumpir: lo estrena la exportación y sirve para
 * cualquier otra acción que solo necesite un acuse de recibo.
 *
 * Cómo lo hace:
 *  - Controlado: se pinta mientras `message` no sea `null` y avisa con `onHide`
 *    cuando vence el tiempo, para que quien lo abrió limpie su estado. El
 *    temporizador se reinicia con cada mensaje nuevo, así dos exportaciones
 *    seguidas no heredan la cuenta atrás de la primera.
 *  - `role="status"` + `aria-live="polite"`: los lectores de pantalla lo leen
 *    sin robar el foco ni cortar lo que estén diciendo.
 *  - No conoce el dominio: recibe el texto ya traducido y compuesto.
 */

import { useEffect } from 'react';

/** Tiempo en pantalla, en ms. El del mockup. */
const VISIBLE_MS = 2800;

export interface ToastProps {
  message: string | null;
  onHide: () => void;
}

export const Toast = ({ message, onHide }: ToastProps) => {
  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(onHide, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message, onHide]);

  if (message === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] bg-ink px-5 py-3 text-[13px] text-accent-tint shadow-[0_12px_34px_rgba(0,0,0,0.35)]"
    >
      {message}
    </div>
  );
};
