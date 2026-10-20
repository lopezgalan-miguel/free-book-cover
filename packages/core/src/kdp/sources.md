# Fuentes y valores KDP / plataformas — contrastados el 2026-10-02 (cortes y máximos de páginas: 2026-10-19; tapa dura: 2026-10-20)

Volver a contrastar antes de cada versión. Si hay discrepancias, manda la plantilla oficial del [calculador de cubiertas](https://kdp.amazon.com/cover-calculator).

## KDP tapa blanda

Fuente: [Create a Paperback Cover](https://kdp.amazon.com/en_US/help/topic/G201953020)

| Dato | Valor |
| --- | --- |
| Grosor por página: B/N blanco | 0,002252 in |
| Grosor por página: B/N crema | 0,0025 in |
| Grosor por página: color estándar | 0,002252 in |
| Grosor por página: color premium | 0,002347 in |
| Sangrado | 0,125 in (3,2 mm) en cada borde exterior |
| Texto en portada y contraportada | ≥ 0,125 in dentro del corte; cuerpo ≥ 7 pt |
| Texto en el lomo | Solo a partir de 79 páginas (Cover Creator: 80); margen ≥ 0,0625 in a cada lado |
| Tolerancia del lomo | ± 0,0125 in |
| PDF | Un archivo; recomendado ≤ 40 MB, no se convierte por encima de 650 MB; 300 ppp; CMYK recomendado; transparencias aplanadas; fuentes incrustadas; sin marcas de corte ni colores directos; sin cifrado |

Fuente: [Barcodes](https://kdp.amazon.com/en_US/help/topic/G5HDYGP4BXLX4RUW)

- Tamaño sugerido 2 × 1,2 in (mínimo 1,4 × 0,8 in), fondo blanco sólido, ≥ 0,25 in del lomo y del corte, sin solaparse con texto.
- Si no se aporta, KDP coloca uno en la contraportada. **No se publica la posición exacta**: reservaremos la esquina inferior derecha de la contraportada (2 × 1,2 in a 0,25 in del lomo y del corte inferior) y la contrastaremos con la plantilla.

Fuente: [Paperback Submission Guidelines](https://kdp.amazon.com/en_US/help/topic/G201834240), tabla «Trim size» de kdp.amazon.com, consultada el 2026-10-19. (La página [Print Options](https://kdp.amazon.com/en_US/help/topic/G201834180) solo muestra la fila de 5 × 8 en su tabla de .com; la de .co.jp es otra lista de cortes.)

Mínimo de 24 páginas (72 en color estándar). Máximo por corte y papel (B/N blanco / B/N crema / *groundwood* / color estándar / color prémium):

| Corte (in) | Blanco | Crema | Groundwood | Color estándar | Prémium |
| --- | --- | --- | --- | --- | --- |
| 5 × 8, 5,06 × 7,81, 5,25 × 8, 5,5 × 8,5, 6 × 9, 6,14 × 9,21, 6,69 × 9,61, 7 × 10, 7,44 × 9,69, 7,5 × 9,25, 8 × 10 | 828 | 776 | 812 | 600 | 828 |
| 8,25 × 6, 8,25 × 8,25 | 800 | 750 | 784 | 600 | 800 |
| 8,27 × 11,69 | 780 | 730 | 764 | no disponible | 590 |
| 8,5 × 8,5, 8,5 × 11 | 590 | 550 | 578 | 600 | 590 |

- El producto admite exactamente estos 16 cortes (`SUPPORTED_TRIMS` en `kdp.ts`, con su máximo por papel). Un papel que el corte no admite da `paper_unavailable_for_trim`.
- Los tamaños personalizados (de 4 a 8,5 in de ancho y de 6 a 11,69 in de alto) no tienen máximo publicado y siguen rechazándose (`trim_unsupported`).
- Tamaño grande: más de 6,12 in de ancho o más de 9 in de alto (otro coste de impresión; el asistente lo marca).
- *Groundwood* no se admite (ver abajo).

Fuente: [Groundwood Paper](https://kdp.amazon.com/en_US/help/topic/G99WKT9FARBGHBJF)

- No se publica el grosor por página. A partir de 350 páginas (crema) o 525 (blanco) el lomo cambia. **No se admite en v1.**

## KDP tapa dura (case laminate) — contrastada el 2026-10-20

Fuentes:
- Plantillas oficiales generadas por KDP `CASE_LAMINATE_5.500x8.500_116_BW_CREAM` y `CASE_LAMINATE_5.500x8.500_128_BW_WHITE`: medidas leídas de los vectores del PDF (rectángulos de corte y zona segura, líneas de pliegue y bisagra, recuadro del código de barras).
- Configuración embebida de la [calculadora de cubiertas](https://kdp.amazon.com/en_US/cover-calculator) (`CASE_LAMINATE`): cortes por defecto y páginas mínimas y máximas.
- [Create a Hardcover Cover](https://kdp.amazon.com/en_US/help/topic/GDTKFJPNQCBTMRV6), [Hardcover](https://kdp.amazon.com/en_US/help/topic/GAVW3FZZAKA2KY3B) y [Hardcover Print Elements](https://kdp.amazon.com/en_US/help/topic/GKZVNAAFYWVKZWL8).

| Dato | Valor | Origen |
| --- | --- | --- |
| Cortes | 5,5 × 8,5; 6 × 9; 6,14 × 9,21; 7 × 10; 8,25 × 11 | calculadora (`HARDCOVER_TRIMS`) |
| Páginas | 76–550 | calculadora; la ayuda dice 75–550 (se usa 76, lo que acepta el generador de plantillas) |
| Papel | B/N blanco, B/N crema, color prémium | sin color estándar en tapa dura |
| Solapa (*wrap*) | 15 mm (0,5906 in) en los cuatro lados | plantilla; la ayuda escribe «0,51″ (15 mm)», que no cuadra con 15 mm |
| Tapa de cartón | corte + 5 mm de ancho, + 6 mm de alto | plantilla |
| Lomo | páginas × grosor del papel + 4,8 mm | plantilla (116 crema: 0,479 in; 128 blanco: 0,477 in) |
| Bisagra | 10 mm (0,3937 in) a cada lado del lomo | plantilla y ayuda («0.4″ (10 mm)») |
| Zona segura | tapa − 0,125 in; en el lado del lomo, hasta la línea de bisagra | plantilla |
| Texto del lomo | lomo − 0,0625 in a cada lado | plantilla |
| Código de barras | 2 × 1,2 in; a 0,25 in de la bisagra y 0,375 in del borde inferior de la tapa | plantilla |
| Resolución | **300 ppp en todas las imágenes** (regla del producto, más estricta que el aviso de tapa blanda) | decisión del usuario, 2026-10-20 |

- `printSetup.binding = "hardcover"`; sin `binding`, tapa blanda (documentos anteriores). `kdpLayout` devuelve las tapas como `back`/`front`, la solapa como `bleedIn` y las bisagras en `hinges`.
- La calculadora no expone su fórmula (la pide al servidor). Los otros cuatro cortes usan las mismas medidas en milímetros; **falta contrastarlos con su plantilla** (ver `VERIFICACION.md`).

## Redes sociales (imagen estática)

Pendiente de confirmar con documentación de Meta en la entrega 5. Referencias de terceros consultadas:

- Instagram: vertical de feed 1080 × 1440 (3:4, nativo desde 2025); 1080 × 1350 (4:5) y 1080 × 1080 (1:1) siguen admitidos; historia 1080 × 1920 (9:16).
- Facebook: feed 1080 × 1350 (4:5) y 1080 × 1080; historia 1080 × 1920.

## MCP

Fuente: [Versioning](https://modelcontextprotocol.io/specification/versioning). Versión vigente: `2026-07-28` (sin *handshake* de inicialización; descubrimiento con `server/discover`). Versión anterior con *handshake*: `2025-11-25`. La decisión se toma en la entrega 8.
