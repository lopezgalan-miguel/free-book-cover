/**
 * CONTRATO · presets de lienzo
 * ----------------------------
 * Catálogo de tamaños de lienzo predefinidos (accesos directos). Datos puros,
 * sin lógica: los consume SizePanel para pintar los botones de proporción y
 * formatos habituales (Amazon KDP, proporciones, redes). Ampliar la lista aquí
 * es todo lo que hace falta para ofrecer un nuevo preset.
 */

import type { CanvasPreset } from '@/types/editor';

export const CANVAS_PRESETS: CanvasPreset[] = [
  // Amazon KDP
  { id: 'kindle', group: 'Amazon KDP', label: 'Kindle', sub: '1600 x 2560', width: 1600, height: 2560 },
  { id: 'pb69', group: 'Amazon KDP', label: 'Tapa blanda', sub: '1800 x 2700', width: 1800, height: 2700 },
  { id: 'audio', group: 'Amazon KDP', label: 'Audiolibro', sub: '2400 x 2400', width: 2400, height: 2400 },

  // Proporciones comunes
  { id: 'r23', group: 'Proporción', label: '2:3', width: 1600, height: 2400 },
  { id: 'r45', group: 'Proporción', label: '4:5', width: 1600, height: 2000 },
  { id: 'r11', group: 'Proporción', label: '1:1', width: 2000, height: 2000 },
  { id: 'r43', group: 'Proporción', label: '4:3', width: 2000, height: 1500 },
  { id: 'r169', group: 'Proporción', label: '16:9', width: 1920, height: 1080 },
  { id: 'r916', group: 'Proporción', label: '9:16', sub: 'story', width: 1350, height: 2400 },
];
