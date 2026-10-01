# Cadena de preimpresión KDP — decisión fijada (entrega 1)

**Fecha:** 2026-10-02 · **Estado:** prueba técnica superada (`pnpm --filter @free-book-cover/companion test`)

## Cadena

1. **Entrada:** PNG opaco en sRGB, ya compuesto al tamaño final con sangrado y sin guías. Se rechaza si tiene canal alfa, si su proporción no coincide con la página o si queda por debajo de 300 ppp.
2. **PDF RGB intermedio** (`pdf-lib`): una página de `ancho × 72` por `alto × 72` pt con la imagen a sangre.
3. **Conversión** con Ghostscript `pdfwrite`:

   | Parámetro | Valor | Motivo |
   | --- | --- | --- |
   | `-dCompatibilityLevel` | `1.3` | PDF sin funciones de transparencia |
   | `-sColorConversionStrategy` / `-sProcessColorModel` | `CMYK` / `DeviceCMYK` | Un solo espacio de color |
   | `-sDefaultRGBProfile` | `srgb.icc` | Perfil de origen explícito |
   | `-sOutputICCProfile` | `default_cmyk.icc` (incluido en Ghostscript) | KDP no exige perfil y elimina los incrustados |
   | `-dRenderIntent` / `-dBlackPtComp` | `1` (colorimétrico relativo) / `1` | Política documentada |
   | `-dDownsampleColorImages` / `-dAutoFilterColorImages` | `false` / `false` | Conservar los 300 ppp |
   | Codificación de imagen | `FlateEncode` (sin pérdida) o `DCTEncode` con `QFactor 0.15` | Flate por defecto; JPEG para no pasar de 40 MB |

4. **Inspección independiente** (no comparte código con el generador):
   - `pdfinfo`: páginas, tamaño en pt, cifrado.
   - `pdfimages -list`: espacio de color, ppp efectivos y ausencia de máscaras.
   - `pdffonts`: fuentes incrustadas.
   - `qpdf --check`: estructura.
   - `qpdf --json`: `/SMask`, grupos de transparencia, `/CA` y `/ca` menores que 1, y `/BM` distinto de Normal.

## Versiones verificadas

Ghostscript 10.08.0 · Poppler 26.09.0 · qpdf 12.4.2 · pdf-lib 1.17.1 · sharp 0.35.5 (macOS arm64, `brew install ghostscript poppler qpdf`).

## Resultado de la prueba

Cubierta 6 × 9 in, 300 páginas en papel blanco (12,9256 × 9,25 in = 930,64 × 666 pt):

- Una página de 930,64 × 666 pt, una imagen `/DeviceCMYK` de 3878 × 2775 px a 300 × 300 ppp, PDF 1.3, sin fuentes, sin transparencias y sin cifrado.
- Peso en la prueba sintética: Flate 72 KB, JPEG 574 KB. Las fotografías reales pesarán mucho más; el umbral de 40 MB se medirá en la entrega 7.
- El inspector rechaza, en pruebas negativas, un PDF RGB a 150 ppp y un tamaño de página que difiere en 0,01 in.

Valores CMYK leídos del flujo de la imagen:

| sRGB | C/M/Y/K | Tinta total |
| --- | --- | --- |
| `#FFFFFF` | 0/0/0/0 | 0 % |
| `#808080` | 51/44/44/8 | 147 % |
| `#E63946` | 3/93/73/0 | 169 % |
| `#000000` | 72/68/67/89 | **296 %** |

## Puntos abiertos (antes de la entrega 7)

- **Tinta total máxima:** el negro puro llega al 296 %. Decidir si se limita (p. ej. a 260–300 %) con otro perfil de salida o con un límite de tinta total, y añadir la medición al inspector.
- **Grises neutros:** se componen sobre todo con CMY y poca K, lo que hace más probables las dominantes de color. Valorar un perfil con GCR más fuerte.
- **Perfil de salida:** `default_cmyk.icc` es genérico. Si se elige un perfil estándar (FOGRA/GRACoL), revisar antes su licencia de distribución.
- **Prueba visual:** el SDD (R-07) pide generar una prueba visual de la conversión. Se hará con `gs -sDEVICE=png16m` a partir del PDF CMYK.
