/**
 * CONTRATO · presets de lienzo
 * ----------------------------
 * Catálogo de tamaños de lienzo predefinidos (accesos directos). Datos puros,
 * sin lógica: los consume `PresetGroup` dentro de `SizePanel`. Ampliar la lista
 * aquí es todo lo que hace falta para ofrecer un nuevo preset.
 *
 * Las dimensiones de este fichero son la ÚNICA fuente de verdad: el subtítulo
 * de los formatos KDP se deriva de `width`×`height` al pintar y nunca se
 * escribe a mano, de modo que la etiqueta no puede mentir sobre el tamaño real.
 *
 * El tipo vive aquí y no en `types/editor.ts` porque un preset no forma parte
 * del proyecto serializable (de él solo se guardan `size` y `activePresetId`)
 * y porque necesita `MessageKey`, que el modelo de dominio no importa.
 */

import type { MessageKey } from '@/i18n/messages';

/** Grupo de un preset: decide en qué sección del panel se pinta. */
export type PresetGroupId = 'kdp' | 'ratio';

export interface CanvasPreset {
  /** Se compara con `activePresetId` del store para marcar el preset activo. */
  id: string;
  group: PresetGroupId;
  labelKey: MessageKey;
  /** Subtítulo traducible ("portada", "story"). Las medidas NO se ponen aquí. */
  subKey?: MessageKey;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  // Amazon KDP
  { id: 'kindle', group: 'kdp', labelKey: 'panel.size.kindle', width: 1600, height: 2560 },
  { id: 'pb69', group: 'kdp', labelKey: 'panel.size.paperback', width: 1800, height: 2700 },
  { id: 'wrap', group: 'kdp', labelKey: 'panel.size.fullCover', width: 3828, height: 2775 },
  { id: 'audio', group: 'kdp', labelKey: 'panel.size.audiobook', width: 2400, height: 2400 },

  // Proporciones comunes
  {
    id: 'r23',
    group: 'ratio',
    labelKey: 'panel.size.ratio23',
    subKey: 'panel.size.ratio23Sub',
    width: 1600,
    height: 2400,
  },
  { id: 'r45', group: 'ratio', labelKey: 'panel.size.ratio45', width: 1600, height: 2000 },
  { id: 'r11', group: 'ratio', labelKey: 'panel.size.ratio11', width: 2000, height: 2000 },
  {
    id: 'r916',
    group: 'ratio',
    labelKey: 'panel.size.ratio916',
    subKey: 'panel.size.ratio916Sub',
    width: 1350,
    height: 2400,
  },
  { id: 'r43', group: 'ratio', labelKey: 'panel.size.ratio43', width: 2000, height: 1500 },
  { id: 'r169', group: 'ratio', labelKey: 'panel.size.ratio169', width: 2560, height: 1440 },
];
