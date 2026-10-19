# Verificación manual contra el calculador oficial de KDP

El [calculador de cubiertas](https://kdp.amazon.com/cover-calculator) es una web interactiva, no una API; las pruebas automáticas (`packages/core/test/kdp.test.ts`) usan el grosor por página oficial (`sources.md`) y casos calculados a mano. Antes de cada versión, repetir esta comprobación y anotar fecha y resultado.

Procedimiento: en el calculador elegir tapa blanda, tamaño, páginas y papel; descargar la plantilla y comparar con la cubierta del editor (anchura total, altura, lomo, posición de los pliegues). Diferencias admitidas: lomo ± 0,0125 in (`SPINE_TOLERANCE_IN`).

| Caso | Lomo esperado | Ancho total | Alto total | Estado |
| --- | --- | --- | --- | --- |
| 6 × 9 in, 300 págs, B/N crema | 0,7500 in | 13,0000 in | 9,2500 in | pendiente |
| 6 × 9 in, 200 págs, B/N blanco | 0,4504 in | 12,7004 in | 9,2500 in | pendiente |
| 5 × 8 in, 100 págs, color premium | 0,2347 in | 10,4847 in | 8,2500 in | pendiente |
| 6 × 9 in, 100 págs, color estándar | 0,2252 in | 12,4752 in | 9,2500 in | pendiente |
| 5 × 8 in, 134 págs, B/N crema | 0,3350 in | 10,5850 in | 8,2500 in | **coincide** (2026-10-19, plantilla `PAPERBACK_5.000x8.000_134_BW_CREAM`: 762 × 594 pt; lomo 0,335 in) |

Código de barras, contrastado el 2026-10-19 con la misma plantilla de 5 × 8 (PNG a 600 ppp): recuadro amarillo en x 2,877–4,874 in e y 6,678–7,875 in del lienzo; el editor reserva x 2,875–4,875 e y 6,675–7,875 in (2 × 1,2 in a 0,25 in del lomo y del corte inferior). Coincide dentro de un píxel de la plantilla.

Pendiente de contrastar con la plantilla: zona segura junto al pliegue (se usa 0,125 in).
