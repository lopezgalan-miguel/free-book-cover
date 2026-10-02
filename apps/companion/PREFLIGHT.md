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

## Decisiones de la entrega 7

- **Tinta total máxima:** se mide en el inspector renderizando el PDF final a CMYK (`gs -sDEVICE=pamcmyk32`, 150 ppp) y tomando la suma C+M+Y+K máxima por píxel. Umbral **300 %**; superarlo es un **aviso**, no bloquea «listo para KDP». El negro puro (296 %) queda justo por debajo. Se mantiene `default_cmyk.icc`.
- **Prueba visual (R-07):** el PDF CMYK se rasteriza de nuevo con `gs -sDEVICE=png16m -r100` y el PNG vuelve al editor junto al informe, para comparar con el diseño.
- **Entrada desde el navegador:** el canvas exporta PNG RGBA; se acepta si el alfa es 255 en todos los píxeles y se aplana. Si hay alfa real se rechaza (informe `input`).
- **Peso:** se genera con Flate; si pasa de 40 MB se regenera con JPEG (QFactor 0,15). Aviso por encima de 40 MB y fallo por encima de 200 MB.
- **Grises y perfil:** sin cambios; se sigue con `default_cmyk.icc`. El valor de la prueba visual permite revisar dominantes; cambiar de perfil queda como mejora futura (licencia FOGRA/GRACoL sin revisar).

## Servidor local

`pnpm --filter @free-book-cover/companion start` arranca un servidor HTTP mínimo (Node, sin dependencias) solo en `127.0.0.1` (puerto 47321 o `FBC_PORT`). El Paso 8 añadirá WebSocket/MCP sobre el mismo servidor.

- **Token** aleatorio por arranque (impreso en consola; `FBC_TOKEN` lo fija en pruebas). Se envía como `Authorization: Bearer`.
- **CORS** restringido a `FBC_ALLOWED_ORIGIN` (lista separada por comas; por defecto `http://localhost:5173`). Se rechazan otros orígenes y cualquier `Host` no local (DNS rebinding).
- `GET /health` (sin token): `{ ok, name, version, authorized }`; el editor lo usa para habilitar la opción PDF.
- `POST /preflight?widthIn=&heightIn=` (token): cuerpo PNG; responde `{ id, report, proofPng }` (`id` nulo si la entrada se rechazó).
- `GET /preflight/:id/pdf` (token): el PDF. Se conservan los dos últimos resultados.

## Puntos abiertos

- **Grises neutros / perfil de salida:** `default_cmyk.icc` es genérico; valorar FOGRA/GRACoL tras revisar su licencia.
