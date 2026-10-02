# Muestra para el previsualizador de KDP

`portada-kdp-muestra.pdf` es una cubierta de prueba generada con la cadena real (editor + companion + Ghostscript), no un montaje. Sirve para comprobar manualmente en el **previsualizador/validador de KDP** (Print Previewer, en tu cuenta de KDP). La subida a KDP requiere tu cuenta: no está automatizada y **la aceptación final está pendiente**.

## Qué es

- Tapa blanda 6 × 9 in, 200 páginas, B/N papel blanco (obra ficticia «La casa de la muestra»).
- Regenerar el PDF: `FBC_WRITE_SAMPLE=1 pnpm --filter @free-book-cover/editor exec playwright test e2e/sample.spec.ts --project=chromium` (necesita `gs`, `poppler` y `qpdf`). Sin la variable solo se valida y no se escribe en `samples/`.
- `informe-preimpresion.txt` es el informe del companion que acompaña al PDF.

## Valores esperados

| Dato | Valor |
| --- | --- |
| Lomo | 200 × 0,002252 = **0,4504 in** (tolerancia KDP: ± 0,0125 in) |
| Tamaño total (con sangrado 0,125 in) | **12,7004 × 9,25 in** = 914,43 × 666 pt (3811 × 2775 px a 300 ppp) |
| Páginas del PDF | 1 |
| Color | DeviceCMYK, 300 ppp efectivos, sin transparencias, sin cifrar, PDF 1.3 |
| Fuentes | Ninguna (el texto se rasteriza) |
| Peso | 1,56 MB (objetivo 40 MB, máximo 200 MB) |
| Tinta total máxima | 287 % (límite del editor 300 %; KDP exige ≤ 300 %) |
| Texto del lomo | Presente (≥ 79 páginas) |
| Código de barras | Hueco libre de 2 × 1,2 in en la esquina inferior derecha de la contraportada (KDP lo coloca) |

Medido con herramientas independientes: `pdfinfo` (914.43 × 666 pts, 1 página, sin cifrar), `pdfimages -list` (cmyk, 300 × 300 ppp) y `qpdf --check` (sin errores).

## Pasos manuales

1. En KDP: *Bookshelf → Crear → Tapa blanda* (o abre un título en borrador) y en *Contenido* elige **Subir una cubierta lista para imprimir (PDF)**.
2. En los datos del título configura 6 × 9 in, B/N papel blanco, 200 páginas (el lomo que calcula KDP depende de ello) y sube `portada-kdp-muestra.pdf`. Los nombres exactos de los menús de KDP pueden cambiar; la muestra no depende de ellos.
3. Abre el **Previsualizador** y revisa los puntos de la lista.

## Lista de comprobación

- [ ] KDP acepta el archivo sin errores de tamaño ni de resolución.
- [ ] El previsualizador muestra el lomo con el ancho esperado (0,4504 in) y el texto del lomo dentro de él, sin cruzar los pliegues.
- [ ] Ningún texto invade las zonas de sangrado ni las rojas de zona no segura (0,125 in desde el corte).
- [ ] La zona del código de barras queda libre (el texto de contraportada no la solapa).
- [ ] El color del previsualizador se parece a la prueba CMYK del informe (no garantiza el impreso).
- [ ] Anotar fecha, resultado y cualquier diferencia con el lomo o la plantilla del calculador en `packages/core/src/kdp/VERIFICACION.md`.
- [ ] Si KDP rechaza algo, guardar su mensaje literal y abrir una incidencia con el PDF.

Regenera la muestra si cambian los valores de KDP (`packages/core/src/kdp/sources.md`).
