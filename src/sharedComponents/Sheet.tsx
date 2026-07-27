/**
 * CONTRATO · Sheet (hoja inferior reutilizable)
 * ---------------------------------------------
 * Panel deslizante desde abajo (bottom sheet), patrón Mobile First que contiene
 * los paneles del editor (texto, fuente, color, lienzo, export) en móvil.
 * En escritorio esos paneles se muestran fijos y esta hoja no se usa.
 *
 * Cómo lo hace:
 *  - Controlado por `open`; muestra un backdrop que cierra al tocar fuera.
 *  - Cabecera con título y botón "Hecho"; cuerpo con scroll para el contenido.
 *  - Reutilizable: recibe `title` y `children`; no conoce el dominio.
 *  - Es un overlay fijo: respeta el área segura inferior (notch) en el cuerpo.
 */

import type { ReactNode } from 'react';
import { useT } from '@/i18n/useI18n';
import { Button } from './Button';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export const Sheet = (sheetProps: SheetProps) => {
  const t = useT();
  if (!sheetProps.open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-ink/30"
        onClick={sheetProps.onClose}
        aria-hidden="true"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={sheetProps.title}
        className="relative flex max-h-[75%] flex-col rounded-t-2xl bg-panel shadow-2xl"
      >
        <header className="flex-none border-b border-line-soft px-4 pb-2.5 pt-2">
          <div
            className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-line"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">{sheetProps.title}</h2>
            <Button variant="ghost" size="none" onClick={sheetProps.onClose}>
              {t('sheet.done')}
            </Button>
          </div>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {sheetProps.children}
        </div>
      </section>
    </div>
  );
};
