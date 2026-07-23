/**
 * CONTRATO · Sheet (hoja inferior reutilizable)
 * ---------------------------------------------
 * Panel deslizante desde abajo (bottom sheet), patrón Mobile First que contiene
 * los paneles del editor (texto, fuente, color, lienzo, export) en móvil.
 * En escritorio esos paneles se muestran fijos y esta hoja no se usa.
 *
 * Cómo lo hará:
 *  - Controlado por `open`; muestra un backdrop que cierra al tocar fuera.
 *  - Cabecera con título y botón "Hecho"; cuerpo con scroll para el contenido.
 *  - Reutilizable: recibe `title` y `children`; no conoce el dominio.
 */

import type { ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet(_props: SheetProps) {
  return null;
}
