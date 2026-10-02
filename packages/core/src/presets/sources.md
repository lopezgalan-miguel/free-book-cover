# Preajustes digitales: valores y fuentes (revisión 2026-10-02, catálogo v1)

El SDD (R-08) no fija números: pide contrastarlos con la documentación de cada plataforma al
implementar. **Estos valores no se contrastaron en línea durante la implementación**
(sin acceso a las páginas de ayuda): son los tamaños recomendados habituales de cada plataforma
y la fecha de revisión indica cuándo se fijaron en el catálogo, no una verificación contra la
fuente. Contrastarlos antes de cada versión; si cambian, se sube `version` del preajuste y las variantes guardadas no se tocan.

| Preajuste | Píxeles | Proporción | Formatos | Origen |
| --- | --- | --- | --- | --- |
| `instagram-feed-portrait` | 1080 × 1350 | 4:5 | PNG, JPEG | Guía de Instagram: publicación vertical del feed |
| `instagram-feed-square` | 1080 × 1080 | 1:1 | PNG, JPEG | Guía de Instagram: publicación cuadrada |
| `instagram-vertical` | 1080 × 1920 | 9:16 | PNG, JPEG | Guía de Instagram: historias/Reels (solo imagen estática) |
| `facebook-feed` | 1080 × 1350 | 4:5 | PNG, JPEG, WebP | Guía de Facebook: publicación de feed |
| `facebook-vertical` | 1080 × 1920 | 9:16 | PNG, JPEG, WebP | Guía de Facebook: historias (solo imagen estática) |
| `custom` | libre | libre | PNG, JPEG, WebP | Tamaño propio del usuario (1–30000 px por lado) |

Pendiente de contrastar con Meta: `packages/core/src/kdp/sources.md` menciona un vertical de feed de Instagram
de 1080 × 1440 (3:4, nativo desde 2025). **No está en el catálogo** porque no se ha confirmado con la
documentación de la plataforma; hasta entonces no se añade el preajuste `instagram-feed-3x4`. Si se confirma,
se añade como v1 sin tocar los demás ni las variantes guardadas.

Notas:
- Instagram solo se ofrece en PNG y JPEG (formatos que admite al subir); Facebook admite también WebP.
- La exportación está limitada a 50 megapíxeles por imagen (SDD §6), independiente de la plataforma.
- Vídeo (Reels/Stories animadas) queda fuera del alcance (SDD R-08).
