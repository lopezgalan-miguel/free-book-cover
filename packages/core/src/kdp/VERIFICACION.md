# Verificación manual contra el calculador oficial de KDP

El [calculador de cubiertas](https://kdp.amazon.com/cover-calculator) es una web interactiva, no una API; las pruebas automáticas (`packages/core/test/kdp.test.ts`) usan el grosor por página oficial (`sources.md`) y casos calculados a mano. Antes de cada versión, repetir esta comprobación y anotar fecha y resultado.

Procedimiento: en el calculador elegir tapa blanda, tamaño, páginas y papel; descargar la plantilla y comparar con la cubierta del editor (anchura total, altura, lomo, posición de los pliegues). Diferencias admitidas: lomo ± 0,0125 in (`SPINE_TOLERANCE_IN`).

| Caso | Lomo esperado | Ancho total | Alto total | Estado |
| --- | --- | --- | --- | --- |
| 6 × 9 in, 300 págs, B/N crema | 0,7500 in | 13,0000 in | 9,2500 in | pendiente |
| 6 × 9 in, 200 págs, B/N blanco | 0,4504 in | 12,7004 in | 9,2500 in | pendiente |
| 5 × 8 in, 100 págs, color premium | 0,2347 in | 10,4847 in | 8,2500 in | pendiente |
| 6 × 9 in, 100 págs, color estándar | 0,2252 in | 12,4752 in | 9,2500 in | pendiente |

Pendiente también de contrastar con la plantilla: posición exacta del código de barras (KDP no la publica; se reserva la esquina inferior derecha, 2 × 1,2 in a 0,25 in del lomo y del corte) y zona segura junto al pliegue (se usa 0,125 in).
