# Diseño · Cablear `presets.ts` a `SizePanel`

Fecha: 2026-07-27
Rama: `feature/set-logic`
Fase: 2A — Cablear los paneles al store (`ESPECIFICACIONES.md:204-215`)

## Problema

`src/features/canvasSize/presets.ts` declara `CANVAS_PRESETS` y su cabecera dice
que lo consume `SizePanel`, pero **nadie lo importa**: es código muerto.
`SizePanel.tsx` mantiene sus propias listas locales `kdpPresets` y `ratioPresets`
(líneas 10-24) con claves i18n.

Las dos fuentes ya han divergido:

| | `presets.ts` | `SizePanel.tsx` |
|---|---|---|
| Cubierta completa (3828×2775) | no existe | sí (`panel.size.fullCover`) |
| Dimensiones de las proporciones | sí | no (solo etiqueta) |
| Etiquetas | castellano fijo | claves i18n |
| `r169` | 1920×1080 | — (el mockup pide 2560×1440) |

Además las dimensiones viven duplicadas en `messages.ts` como claves puramente
numéricas (`'panel.size.kindleSub': '1600×2560'`), repetidas en ES y en CA: un
dato metido en el catálogo de traducciones.

El store ya está listo: `activePresetId` (`editorStore.ts:151`) y
`setSize(size, presetId)` (`editorStore.ts:224`).

## Alcance

Dentro: catálogo de presets, su consumo en `SizePanel`, preset activo e inputs de
ancho/alto controlados. El bloque "Lienzo" queda funcional de punta a punta.

Fuera: subida de imagen, capas de texto, componentes `Slider`/`Toggle`. Son
bullets aparte de la Fase 2A.

## 1. El dato: `CanvasPreset` y `presets.ts`

`src/types/editor.ts`:

```ts
export interface CanvasPreset {
  id: string;                 // coincide con activePresetId del store
  group: 'kdp' | 'ratio';     // discrimina sección y estilo de botón
  labelKey: MessageKey;
  subKey?: MessageKey;        // solo texto real ("portada", "story")
  width: number;
  height: number;
}
```

`group` pasa de string libre (`'Amazon KDP'`) a un union porque el panel no solo
lo imprime: discrimina con él en qué sección va cada preset. La etiqueta visible
sigue saliendo de `panel.size.amazonKdp` / `panel.size.proportion`.

El catálogo queda en 10 entradas: los tres KDP actuales + `wrap` (3828×2775, la
cubierta completa que hoy solo existe en el panel) y las seis proporciones, con
`r169` corregido a 2560×1440. Sigue siendo un fichero de datos puros, sin lógica.

Se descarta guardar las dimensiones como `subKey` traducible: mantendría cada
medida escrita en tres sitios (presets + ES + CA), que es justo lo que provocó la
divergencia actual. Y se descarta `label` literal sin i18n: funciona para "2:3"
o "Kindle", pero rompe con "Tapa blanda" y "Audiolibro", que necesitan versión
catalana.

## 2. El consumo: `SizePanel`

Desaparecen `kdpPresets` y `ratioPresets` locales. En su lugar, dos listas
derivadas de `CANVAS_PRESETS` filtrando por `group`, y un único componente de
botón que recibe el preset.

El subtítulo se resuelve así:

1. si hay `subKey`, se traduce;
2. si no y el grupo es `kdp`, se pinta `${width}×${height}`;
3. en proporciones sin `subKey`, nada.

Al pulsar: `setSize({ width, height }, preset.id)`.

El estilo acentuado deja de depender del grupo y pasa a depender de
`activePresetId === preset.id`, que es lo que el botón debe comunicar. Hoy los
KDP salen todos acentuados a la vez, que es maqueta, no estado.

## 3. Los inputs de píxeles

Pasan a controlados desde `size` del store. Al confirmar:

```ts
setSize({ width: clamp(n, 100, 10000), height }, 'custom')
```

con lo que el preset activo se apaga solo. Se aplica en `onBlur` / `Enter` en
vez de en cada pulsación, para que borrar el campo para reescribirlo no colapse
el lienzo a 100.

## 4. Limpieza i18n

Fuera de `messages.ts` (ES y CA) las cuatro claves numéricas: `kindleSub`,
`paperbackSub`, `fullCoverSub`, `audiobookSub`. Se quedan `ratio23Sub` y
`ratio916Sub`, que son texto real. `panel.size.fullCover` ya existe; solo cambia
quién lo consume.

## Riesgo conocido, asumido

`SizePanel` mezcla imagen + lienzo + capas en un solo fichero, y `layerSamples`
sigue siendo maqueta. No se parte aquí porque la Fase 2B ya prevé separarlo en
`ImagePanel` / `SizePanel` / `LayerList`; adelantarlo ensancharía el diff sin
necesidad.

## Criterios de aceptación

- [ ] `CANVAS_PRESETS` se importa en `SizePanel` y no queda ninguna lista de
      presets duplicada en el panel.
- [ ] Los diez presets se pintan en su sección; los KDP muestran sus dimensiones
      reales derivadas de `width`/`height`.
- [ ] Pulsar un preset cambia el tamaño del lienzo y ese botón, y solo ese, queda
      marcado como activo.
- [ ] Los inputs de ancho/alto reflejan `size`, admiten edición y al confirmar
      aplican `clamp(100, 10000)` dejando el preset en `custom`.
- [ ] `messages.ts` no contiene claves cuyo valor sea solo una dimensión.
- [ ] Todo el texto visible sigue traducido en ES y CA.
- [ ] `tsc` y el build pasan sin errores.
