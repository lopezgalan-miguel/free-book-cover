# KDP Cover Creator

Editor local de portadas de libros para Amazon KDP (tapa blanda) y para redes. Todo se edita y se guarda en tu navegador; solo el PDF de imprenta y la conexión MCP necesitan el proceso local (companion). Interfaz en español y catalán, para escritorio y móvil.

Especificación: `Plan/kdp-cover-creator-sdd.md` (v0.4).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `packages/core` | Lógica pura sin DOM: esquema del documento, comandos, geometría, KDP, límites, MCP (contrato) |
| `apps/editor` | Editor React + Vite + Fabric.js (vista) + Tailwind. Ver `PERFORMANCE.md` y `ACCESSIBILITY.md` |
| `apps/companion` | Proceso Node local: preimpresión CMYK, puente y servidor MCP. Ver `PREFLIGHT.md` y `MCP.md` |
| `samples/` | PDF de muestra para el previsualizador de KDP y sus pasos (`SAMPLE.md`) |

## Requisitos

- Node 22 o superior y pnpm 11 (`corepack enable`).
- Para el PDF KDP (companion): **Ghostscript (`gs`), Poppler (`pdfinfo`, `pdfimages`, `pdffonts`, `pdftoppm`) y `qpdf`** en el `PATH`. En macOS: `brew install ghostscript poppler qpdf`.
- Para los tests E2E: el Chromium de Playwright, `pnpm --filter @free-book-cover/editor exec playwright install chromium`.

## Arrancar

```sh
pnpm install

# Editor (http://localhost:5173)
pnpm dev

# Companion (otra terminal): imprime la dirección y el token de la sesión
pnpm --filter @free-book-cover/companion start
```

En el editor, *Exportar → PDF* pide la dirección (`http://127.0.0.1:47321`) y el token del companion. El companion solo acepta el origen del editor (`FBC_ALLOWED_ORIGIN`, por defecto `http://localhost:5173`), el puerto se cambia con `FBC_PORT` y el token con `FBC_TOKEN`. La conexión MCP se explica en `apps/companion/MCP.md`.

En móvil (menos de 768 px de ancho) el editor muestra barra superior, lienzo, pestañas Texto/Fuente/Color/Estilo/Lienzo y una hoja inferior con los mismos paneles. La exportación PDF KDP sigue necesitando el companion (que corre en tu ordenador), por lo que en el móvil queda deshabilitada y explicada hasta que se conecte uno; PNG, JPEG y WebP funcionan siempre.

## Guardado y proyectos

- El editor autoguarda en IndexedDB tras una pausa de unos segundos y avisa al cerrar o recargar si quedan cambios sin guardar; *Guardar* sigue disponible.
- El botón con el nombre del proyecto (cabecera de escritorio y barra móvil) abre el diálogo de proyecto: renombrar, crear uno nuevo, abrir o borrar otros guardados, descargar e **importar copias de seguridad** (todas las partes juntas) y **liberar espacio** (quita los recursos sin uso tras confirmar y vacía el historial de deshacer). Los blobs que ningún paso del historial referencia se purgan solos al guardar y al abrir.
- Los cambios continuos (escribir, arrastrar el selector de color) cuentan como un solo paso de deshacer.

## Tests

Desde la raíz:

```sh
pnpm test        # Vitest: core, companion, editor
pnpm typecheck   # TypeScript estricto en los tres paquetes
pnpm e2e         # Playwright (escritorio y móvil); levanta Vite (5199) y un companion (47399) de pruebas
```

Notas del E2E:

- Los proyectos son `chromium` (escritorio 1440 × 900, todas las pruebas) y `mobile` (390 × 844 táctil; flujos críticos y accesibilidad). La prueba de aceptación R-10 (`e2e/r10.spec.ts`) aplica las mismas ediciones en ambos diseños y compara el documento.
- Medición de rendimiento: `pnpm --filter @free-book-cover/editor perf`.
- Regenerar la muestra de KDP: ver `samples/SAMPLE.md`.
- El E2E de preimpresión necesita `gs`, Poppler y `qpdf`.

## Verificaciones manuales pendientes

Lo siguiente no se puede automatizar y sigue **sin comprobar**:

1. **Código de barras y pliegue frente a la plantilla oficial de KDP**: lomo ± 0,0125 in con el calculador de cubiertas, posición real del código de barras y zona segura junto al pliegue (`packages/core/src/kdp/VERIFICACION.md`, `sources.md`).
2. **Inspector MCP y segundo cliente MCP real** (MCP Inspector y Claude Code o similar): pasos en `apps/companion/MCP.md`, sección «Verificación manual».
3. **Valores de los preajustes de redes** (Instagram, Facebook): se fijaron sin contrastar en línea con cada plataforma (`packages/core/src/presets/sources.md`). Incluye confirmar con Meta si el vertical de feed de Instagram es 1080 × 1440 (3:4), que no está en el catálogo.
4. **Subida de la muestra al previsualizador de KDP** con tu cuenta: `samples/SAMPLE.md` (lista de comprobación).
5. **Decisión pendiente de producto: fuentes por CDN (Google Fonts).** `apps/editor/index.html` carga la tipografía de la interfaz y el catálogo de fuentes desde Google Fonts. Esto contradice «los archivos permanecen en el dispositivo» (SDD §6): se envía la IP y el uso a un tercero (riesgo de privacidad, relevante en la UE), el editor no renderiza el texto del catálogo sin red, la exportación depende de un tercero y fuerza el render del PDF en el hilo principal. Opciones: autoalojar las fuentes (p. ej. con fontsource) o mantenerlo y declararlo en la política de privacidad. No se ha cambiado nada hasta que se decida.
6. Probar el editor en un **móvil real** (memoria con imágenes de 80 Mpx, gestos táctiles sobre el lienzo, lectores de pantalla): ver `apps/editor/PERFORMANCE.md` y `ACCESSIBILITY.md`.
