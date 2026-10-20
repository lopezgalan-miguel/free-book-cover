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

## Tapa dura (2026-10-20)

Procedimiento: en el calculador elegir *Hardcover*, tamaño, páginas y papel; descargar la plantilla (`CASE_LAMINATE_…zip`) y comparar las coordenadas de su PDF (`qpdf --qdf` y los operadores `re`/`m`/`l`) con `kdpLayout`. Las pruebas `packages/core/test/hardcover.test.ts` fijan los valores de las dos plantillas contrastadas con una tolerancia de 1e-5 in.

| Caso | Lomo | Ancho total | Alto total | Estado |
| --- | --- | --- | --- | --- |
| 5,5 × 8,5 in, 116 págs, B/N crema | 0,4790 in | 13,0538 in | 9,9173 in | **coincide** (`CASE_LAMINATE_5.500x8.500_116_BW_CREAM`: 939,8721 × 714,0472 pt; pliegues, bisagras, zonas seguras, lomo útil y código de barras) |
| 5,5 × 8,5 in, 128 págs, B/N blanco | 0,4772 in | 13,0520 in | 9,9173 in | **coincide** (`CASE_LAMINATE_5.500x8.500_128_BW_WHITE`) |
| 6 × 9 in | — | — | — | pendiente (fórmula aplicada, sin plantilla) |
| 6,14 × 9,21 in | — | — | — | pendiente |
| 7 × 10 in | — | — | — | pendiente |
| 8,25 × 11 in | — | — | — | pendiente |

El PDF que genera el editor para 5,5 × 8,5 / 116 / crema mide 939,87 × 714,05 pt, igual que la plantilla (`apps/editor/e2e/hardcover.spec.ts`, con el companion real). Falta subirlo al previsualizador de KDP.
