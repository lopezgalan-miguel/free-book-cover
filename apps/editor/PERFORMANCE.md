# Rendimiento (SDD §6)

Mediciones reales del Paso 9, sin cifras inventadas. Reproducir con `pnpm --filter @free-book-cover/editor perf` (escribe `apps/editor/test-results/perf.json`). El test falla si se supera un presupuesto.

## Entorno de medida

- Apple M4, 16 GB, macOS 24.6 (Darwin), Chromium de Playwright 1.63 **headless con render por software** (sin GPU real), servidor de desarrollo de Vite (sin minificar).
- «Equipo de referencia» (SDD §8.2): **no hay equipo de gama baja disponible**; las cifras son un mejor caso en escritorio y, para móvil, una emulación (viewport 390 × 844 a 2x, CPU 4 veces más lenta mediante `Emulation.setCPUThrottlingRate`). No equivale a un teléfono real: la memoria disponible de un móvil es lo que más puede cambiar el resultado con imágenes de 80 Mpx.
- Los fotogramas se miden con `requestAnimationFrame` durante un arrastre de 40 pasos; el máximo posible en esta medida es 16,7 ms (60 Hz).
- «Memoria»: `JSHeapUsedSize` (CDP) y RSS sumado de los procesos de este Chromium (incluye ~410–450 MB de base de un Chromium vacío con la página cargada). La imagen decodificada vive fuera del heap de JS.

## Proyectos de referencia

- **A.** Portada 6 × 9 in con una foto de fondo de **8944 × 8944 px (79,99 Mpx)**, JPEG de ~18 MB generado en el navegador (degradado con ruido; una foto real pesará más y decodificará más despacio) y un texto.
- **B.** Portada 6 × 9 in con **300 bloques de texto** (la quinta parte con sombra).
- **C.** Móvil emulado (CPU 4x): foto de 80 Mpx como A y 100 textos.

## Resultados (media de varias ejecuciones; variación entre ejecuciones < 10 %)

| Métrica | A (80 Mpx) | B (300 textos) | C (móvil, CPU 4x) | Presupuesto |
| --- | ---: | ---: | ---: | --- |
| Importar la foto hasta el primer pintado | 0,50 s | — | 4,5 s (con generarla en la página) | A < 8 s; C < 30 s |
| Recargar con el proyecto guardado hasta pintar | 0,06 s | — | — | < 5 s |
| Añadir los bloques hasta el primer render | — | 0,16 s | 0,12 s | B < 3 s |
| Peor render al cambiar de zoom (5 pasos) | 34 ms | 34 ms | 87 ms | < 500 ms (C < 1,5 s) |
| Editar un bloque hasta renderizar | — | 35 ms | — | < 500 ms |
| Arrastre: p95 de intervalo de fotograma | 16,7 ms | 16,7 ms | 16,8 ms | p95 < 50 ms (C < 100 ms) |
| Arrastre: máximo | 16,8 ms | 50 ms | 16,8 ms | < 250 ms |
| Exportar PNG 1800 × 2700 | 0,42 s | 0,06 s | 0,83 s | A, B < 8 s / 5 s; C < 15 s |
| Heap de JS tras exportar | 17–27 MB | 35–56 MB | 19 MB | < 200 MB |
| RSS del navegador (tras importar / exportar) | 920 / 990 MB | 680 MB | — | < 3 GB |

Interpretación:

- La vista previa **no decodifica el original**: usa una miniatura de 1024 px generada al importar, por eso zoom y arrastre se mantienen a 60 fps incluso con 80 Mpx. El coste de la imagen grande se paga al importar (decodificar para la miniatura) y al exportar (se vuelve a decodificar el original).
- El RSS sube ~450–500 MB al importar la imagen de 80 Mpx (decodificación de 320 MB de píxeles RGBA más copias) y no se libera del todo después: en un dispositivo con poca memoria esa importación es el punto de riesgo. Si fallara, el editor ya muestra el error recuperable de miniatura/decodificación y no deja el documento a medias.
- La exportación PNG usa el tamaño real (300 ppp): 4,9 Mpx, muy lejos del límite de 50 Mpx. El límite de 50 Mpx se ejerce al ampliar el lienzo (ver `e2e/limits.spec.ts`).
- PDF KDP en el peor caso real de la versión 1 (6 × 9 in, 828 páginas, imagen de ruido a pantalla completa, 4235 × 2775 px): **29,5 MB** con el companion (JPEG de respaldo al pasar de 40 MB con Flate), unos 10 s en total; por debajo del objetivo de 40 MB. Un PDF de 200 MB no se puede producir con los tamaños y los 300 ppp admitidos.

## Qué falta

- Equipo de gama baja real y navegadores móviles reales (Safari iOS en particular) para validar el límite de 80 Mpx; hasta entonces el límite de producto sigue siendo el del SDD, con la advertencia de que en móviles con poca memoria puede ser demasiado alto.
- Medir con GPU y con la compilación de producción (`vite build`); aquí se midió contra el servidor de desarrollo.
