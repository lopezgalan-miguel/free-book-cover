# MCP local del companion (SDD R-09, D-07, D-10)

El companion expone el editor abierto a cualquier cliente MCP compatible (Claude Code, MCP Inspector, otros). Las herramientas no dependen de ningún modelo: emiten **comandos de `core`** que el editor ejecuta con `applyCommand` (revisión esperada, validación, historial y guardado). Fabric nunca se toca.

## Arquitectura

```
cliente MCP ──stdio──> proceso MCP (src/mcp/main.ts) ──WebSocket /ws/mcp──> companion (HTTP local) ──WebSocket /ws/editor──> editor (navegador)
```

- **Proceso MCP** (`pnpm --silent --dir apps/companion mcp`): lo lanza el cliente MCP por stdio. stdout es solo del protocolo; los avisos van a stderr. Es un cliente del companion que ya está en marcha (`pnpm --filter @free-book-cover/companion start`); conecta bajo demanda y reconecta en la llamada siguiente.
- **Companion**: el servidor HTTP del Paso 7 ahora acepta WebSocket en `/ws/editor` y `/ws/mcp`. Solo reenvía; no modifica documentos.
- **Editor**: ejecuta cada llamada con los comandos de `core`. Es la única vía de mutación, con deshacer/rehacer y persistencia.
- `zod` figura en `apps/companion/package.json` aunque el código del companion no lo importa: el SDK MCP lo exige como dependencia par (`peerDependencies: zod ^3.25 || ^4`) y pnpm, al ser estricto, no lo resuelve si no está declarado en el paquete que usa el SDK. Se mantiene por eso y debe seguir en un rango compatible con el de `packages/core`.
- Los esquemas (zod), los errores y los mensajes del canal viven en `packages/core/src/mcp/protocol.ts` y los comparten companion y editor.

## Versión del protocolo

- SDK oficial `@modelcontextprotocol/sdk` **1.31.0** (fijada, sin `^`), transporte stdio.
- Versión del protocolo implementada: **2025-11-25**, la más reciente que soporta ese SDK (`LATEST_PROTOCOL_VERSION`). El SDK negocia además `2025-06-18`, `2025-03-26`, `2024-11-05` y `2024-10-07`: un cliente que pida una de ellas recibe esa; si pide otra desconocida, el servidor responde `2025-11-25`. Está probado con un cliente del SDK y con `initialize` escrito a mano (`test/mcpStdio.test.ts`).
- **Punto abierto del SDD §10 resuelto así**: la especificación `2026-07-28` (sin *handshake* de inicialización) **no** se implementa porque el SDK 1.31.0 no la soporta ni en su versión de borrador utilizable (solo expone `DRAFT-2026-v1` como tipos). Se admite `2025-11-25` y las anteriores del SDK. Cuando el SDK publique la nueva versión se actualiza la dependencia y se revisa `src/mcp/server.ts` (solo registra las dos peticiones `tools/list` y `tools/call`).
- Capacidades declaradas: solo `tools`. Sin recursos, prompts ni tareas.

## Herramientas

Todas las entradas son `strict` (campos desconocidos se rechazan). Longitudes en pulgadas. Las mutaciones exigen `expectedRevision`; `get_canvas_state` devuelve la vigente.

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `get_canvas_state` | `projectId?` (por defecto el autorizado) | `projectId`, `name`, `mode`, `revision`, `canvas`, `elements[]`, `assets[]` |
| `add_text_element` | `projectId`, `expectedRevision`, `text` o `runs`, `x?`, `y?`, `width?`, `fontFamily?`, `fontSizePt?`, `weight?`, `italic?`, `underline?`, `uppercase?`, `color?`, `align?`, `lineHeight?`, `letterSpacing?` | `elementId`, `revision`, `saved` |
| `update_element_style` | `projectId`, `expectedRevision`, `elementId`, `style` (propiedades permitidas según el tipo) | `element`, `revision`, `saved` |
| `import_asset` | `projectId`, `expectedRevision?`, `kind: "image"`, `path` | `assetId`, `revision`, `mimeType`, `widthPx`, `heightPx`, `sizeBytes`, `saved` |
| `apply_background` | `projectId`, `expectedRevision`, `assetId` o `color`, `fit?` (`cover`/`contain`/`fill`), `filters?` (solo con `assetId`) | `revision`, `background`, `fit`, `saved` |
| `import_font` | `projectId`, `expectedRevision?`, `path` (.ttf/.otf/.woff2) | `assetId`, `family`, `revision`, `sizeBytes`, `axes` (ejes de una fuente variable o `null`), `saved` |
| `add_image_element` | `projectId`, `expectedRevision`, `assetId`, `x?`, `y?`, `width?`+`height?`, `rotation?`, `fit?`, `crop?` | `elementId`, `revision`, `saved` |
| `add_shape_element` | `projectId`, `expectedRevision`, `shape` (`rect`/`ellipse`), `x`, `y`, `width`, `height`, `fill`, `stroke?`, `rotation?` | `elementId`, `revision`, `saved` |
| `add_variant` | `projectId`, `expectedRevision`, `presetId` (preajuste o `custom` con `widthPx`, `heightPx`), `name?` | `targetId`, `widthPx`, `heightPx`, `revision`, `saved` |
| `update_variant` | `projectId`, `expectedRevision`, `targetId`, `view?` (`x`, `y`, `zoom`), `background?`, `elements?` (ajustes por elemento) | `targetId`, `visibleArea`, `notInside[]`, `revision`, `saved` |
| `set_print_setup` | `projectId`, `expectedRevision`, `trimWidthIn`, `trimHeightIn`, `pageCount`, `paperAndInk`, `binding?` (`paperback` \| `hardcover`) | `revision`, `binding`, `canvas`, `spineIn`, `back`, `spine`, `front`, `hinges`, `safeFront`, `safeBack`, `spineSafe`, `barcode`, `saved` |
| `set_canvas` | `projectId`, `expectedRevision`, `widthIn`, `heightIn` | `revision`, `canvas`, `saved` |
| `set_background_filters` | `projectId`, `expectedRevision`, `filters` (`{ blur?, brightness?, saturation? }` o `null`) | `revision`, `filters`, `saved` |
| `generate_texture` | `projectId`, `expectedRevision?`, `kind` (`cracked-marble`/`stone`/`paper`), `seed`, `sizePx?` (64–2048, por defecto 1024), `scale?`, `color?`, `cracks?` (`holes`/`lines`), `crackColor?`, `soften?` (0..8, desenfoque periódico del patrón) | `assetId`, `widthPx`, `heightPx`, `revision`, `saved` |
| `rename_project` | `projectId`, `expectedRevision`, `name` (1–120 caracteres) | `revision`, `name`, `saved` |
| `remove_element` | `projectId`, `expectedRevision`, `elementId` | `revision`, `saved` |
| `reorder_element` | `projectId`, `expectedRevision`, `elementId`, `toIndex` (0 = fondo; si pasa del último, queda al frente) | `revision`, `order` (IDs del fondo al frente), `saved` |
| `export_image` | `projectId`, `target?` (variante; sin él, el base a 300 ppp), `format` (`png`/`jpeg`/`webp`), `quality?` | `path`, `fileName`, `format`, `widthPx`, `heightPx`, `bytes` |
| `export_kdp_pdf` | `projectId` | `state` (`ready`/`not_validated`), `path` (PDF; `null` si la preimpresión rechazó la entrada), `reportPath`, `checks` (`{ id, status }`), `widthIn`, `heightIn` |

Los esquemas JSON de entrada y salida se publican en `tools/list` (generados con `z.toJSONSchema`). Notas:

- `get_canvas_state.projectId` es opcional (desviación respecto a la tabla del SDD) para que un cliente pueda descubrir el proyecto autorizado; el resto lo exige.
- Fragmentos con estilos distintos: `add_text_element` admite `runs` en lugar de `text` (exactamente uno de los dos), y `update_element_style` admite `style.runs`, que sustituye el texto entero. Cada fragmento es `{ text, fontFamily?, fontSizePt?, weight?, italic?, underline?, uppercase?, color? }`; los estilos del elemento (o de `style`) son el valor por defecto de cada fragmento y lo que indique el fragmento manda (en `style.runs`, lo que no indique nadie se hereda del primer fragmento actual). Sin peso, se elige el más próximo a 500 de la familia y cursiva del fragmento. `get_canvas_state` devuelve `runs` solo si el texto tiene más de un fragmento. Ejemplo:

  ```json
  { "italic": true, "runs": [{ "text": "La segunda entrega de " }, { "text": "Susurros de terror", "italic": false }] }
  ```
- `fontFamily` debe ser del catálogo del editor o una fuente subida al proyecto; otra cosa es `invalid_params` (el editor no sustituye fuentes en silencio).
- `update_element_style`: en textos admite `fontFamily`, `fontSizePt`, `weight`, `italic`, `underline`, `uppercase`, `color` (se aplican a todos los fragmentos), `align`, `lineHeight`, `letterSpacing`, `shadow`, `outline`, `curvature`, `scaleX` (anchura de letra, 0,5–1,5; la caja no cambia de ancho ni de posición y las líneas se recolocan; si la palabra más larga deja de caber, el ajuste automático ensancha la caja), `texture` (`{ assetId, fit?: "cover" | "tile", tileIn?, pos? }`; `null` la quita), `mask` (máscara de recorte: como `texture` más `mode` `dark`/`light`/`alpha`, `threshold` 0..1 y `softness?`; `null` la quita), `innerShadow` (`{ on, color, opacity, angle, distance, blur }`, distancias en em; `null` la quita), `bevel` (relieve: dos sombras interiores, luz del lado del ángulo y sombra del contrario; p. ej. `{ "on": true, "depth": 0.025, "angle": 90, "soften": 0.02, "highlight": "#ffffff", "highlightOpacity": 0.6, "shade": "#000000", "shadeOpacity": 0.5 }`, `depth` y `soften` en em 0..0,3; `null` lo quita; sin soporte de capas en el lienzo se ignora) y `stretch` (anchura `wdth` de una fuente variable **subida**; en otra fuente es `invalid_params`); `shadow` admite además `color`, `opacity`, `angle` (grados, 90 = abajo), `distance` (em) y `spread` (expansión, em, 0..0,3); en formas `fill` y `stroke`; en imágenes `fit`, `crop` y `filters` (`{ blur 0..100, brightness %, saturation % }`; `null` los quita); y en todos `x`, `y`, `width`, `height`, `rotation`, `visible` y `opacity` (0..1). `id`, `type` y `zIndex` no se pueden cambiar. Una propiedad que no aplica al tipo es `invalid_params`.
- `update_variant` aplica encuadre, fondo y ajustes de elementos con un único comando (`updateVariant`): una revisión y un paso de deshacer. `view.x`/`view.y` (0..1, 0,5 = centrado) desplazan la zona visible del base y `view.zoom` (1..8) la amplía; fondo y elementos derivados se mueven juntos y los ajustes por elemento siguen siendo absolutos en pulgadas de la variante.
- `set_print_setup` admite los 16 cortes oficiales de tapa blanda de KDP (`packages/core/src/kdp/sources.md`) con su máximo de páginas por papel; un tamaño personalizado o un papel que el corte no admite es `invalid_params`.
- Con `binding: "hardcover"` (tapa dura, case laminate) admite 5,5 × 8,5, 6 × 9, 6,14 × 9,21, 7 × 10 y 8,25 × 11, de 76 a 550 páginas, en blanco y negro o color prémium. `back` y `front` son las tapas de cartón (el corte + 5 × 6 mm), la solapa de 15 mm rodea el lienzo y `hinges` da las dos líneas de bisagra (10 mm a cada lado del lomo): la zona segura termina en ellas. Si alguna imagen (fondo, capa de imagen o textura de texto) queda por debajo de 300 ppp con esa geometría, es `invalid_params` con una línea por imagen (`id: N ppp…`) y no cambia nada; después, el editor bloquea el PDF mientras alguna imagen siga por debajo.
- Resplandor: una sombra sin desplazamiento y con expansión, p. ej. `shadow: { "on": true, "intensity": 60, "color": "#ffd24a", "opacity": 0.9, "distance": 0, "spread": 0.12 }`. `spread` (em, 0..0,3) ensancha la silueta de la sombra; sin soporte de capas en el lienzo se ignora.
- Grietas huecas en un título: `generate_texture` con `cracked-marble` y, en el texto, `texture` y `mask` con el mismo `assetId`, `fit: "tile"`, el mismo `tileIn` y `mask.mode: "alpha"`. La sombra exterior y la interior siguen la letra ya recortada.
- `export_image` comprueba fuentes y recursos como el diálogo *Exportar*. El editor entrega los bytes y el proceso MCP los escribe en `FBC_EXPORT_DIR` sin sobrescribir (añade `-2`, `-3`…); sin esa variable devuelve `invalid_params`. Un archivo de más de 28 MiB no cabe en el canal y se rechaza con el motivo.
- `export_kdp_pdf` genera el PDF de imprenta de una cubierta KDP (CMYK, 300 ppp) y el informe de preimpresión (`<nombre>-informe-preimpresion.txt`, en el idioma guardado del editor), ambos en `FBC_EXPORT_DIR`. Exige el editor conectado al companion de preimpresión (normalmente basta con conectar MCP: el panel guarda la misma configuración que el diálogo *Exportar → PDF*; si no está conectado es `invalid_params` y no se renderiza nada) y `FBC_EXPORT_DIR` (sin él es `invalid_params` y no se renderiza nada). Un proyecto que no es cubierta KDP es `invalid_params` (usa `set_print_setup`); en tapa dura, una imagen por debajo de 300 ppp también, con una línea por imagen. `state: "ready"` solo si todas las comprobaciones pasan; si no es `not_validated` y el PDF lleva `PRUEBA-NO-VALIDADA` en el nombre. Si el companion rechaza la entrada no hay PDF: `path` es `null` y solo se escribe el informe. PDF e informe comparten sufijo si ya existían (`-2`, `-3`…). Un PDF de más de 28 MiB no cabe en el canal y se rechaza tras renderizar (usa *Exportar → PDF* en el editor). El render a 300 ppp tarda: esta herramienta espera hasta 180 s (el resto, 20 s); si tu cliente MCP corta antes (muchos usan 60 s por defecto), sube su timeout de herramienta.
- `get_canvas_state` incluye `printSetup` y `variants` cuando existen, y la familia de las fuentes subidas.
- Un recurso o variante ausente es `not_found` con `resource` `asset` o `variant`.
- `apply_background` aplica fondo y encuadre con un único comando (`setBackground` con `fit`): una revisión y un solo paso de deshacer.
- `remove_element` es la única herramienta marcada `destructiveHint: true`: borra el elemento y también sus ajustes en las variantes, en un solo paso; deshacer en el editor lo recupera todo.
- `saved`: el editor guarda el proyecto tras cada cambio; si el guardado falla, la edición sigue aplicada (se puede deshacer) y `saved` es `false`.

### Importación de recursos (`import_asset`)

Sustituye a la subida de base64 arbitrario: el cliente da una **ruta local** y el proceso MCP lee el archivo y entrega sus bytes al editor. Comprobaciones, todas antes de enviar nada:

- La ruta (tras resolver enlaces simbólicos) debe estar dentro de `FBC_IMPORT_DIRS` (lista separada por `:` en macOS/Linux o `;` en Windows). **Por defecto, solo el directorio de trabajo del proceso MCP**; ojo: con `pnpm --dir apps/companion mcp` ese directorio es `apps/companion`, así que define `FBC_IMPORT_DIRS`.
- Debe ser un archivo normal (se abre con O_NOFOLLOW y se comprueba con fstat sobre el descriptor), de tamaño ≤ `FBC_MAX_IMPORT_BYTES` (por defecto 20 MiB), con firma de PNG, JPEG, WebP o GIF.
- El editor aplica además los límites del producto (100 MB, 80 Mpx, 500 MB por proyecto).
- Inexistente y fuera de los directorios permitidos dan el mismo `not_found` (sin oráculo de existencia). Los errores no incluyen rutas del sistema.

## Errores tipificados

Un error es un resultado de herramienta con `isError: true` y un texto JSON `{"error": {...}}` (sin `structuredContent`, que los clientes validarían contra el esquema de éxito). Un nombre de herramienta desconocido es un error de protocolo (`-32602`).

| `kind` | Campos | Cuándo |
| --- | --- | --- |
| `invalid_params` | `issues[]` (ruta y motivo, nunca el valor) | Esquema, propiedad no aplicable, fuente desconocida, `color` con `fit`, archivo demasiado grande o no imagen. |
| `not_found` | `resource` (`project`, `element`, `asset`, `file`), `id?` | Elemento, recurso o archivo ausente (o fuera de los directorios permitidos). |
| `conflict` | `expectedRevision`, `actualRevision` | Revisión obsoleta. **No se muta nada.** Léase otra vez el estado y reintente. |
| `editor_disconnected` | `reason`: `no_companion`, `no_editor`, `not_authorized`, `timeout` | Companion apagado, editor sin abrir/conectar, proyecto sin autorizar (o distinto del autorizado) o el editor no respondió en 20 s. |
| `busy` | — | Demasiadas llamadas pendientes en el companion (16). |
| `internal` | — | Fallo inesperado, sin detalle interno. |

Atomicidad: cada herramienta es un único comando de `core` (o, en `import_asset`, el recurso se guarda y se retira si falla el comando). Un conflicto, un parámetro inválido o un recurso ausente se detectan antes de aplicar nada; ninguna llamada deja el documento parcialmente mutado. En `timeout` el editor pudo llegar a aplicar el cambio: vuelva a leer el estado.

## Seguridad

- Mismo estándar que `/preflight`: solo 127.0.0.1, token por arranque (impreso en la consola del companion), `Host` local obligatorio (anti DNS rebinding).
- El token se presenta en el **primer mensaje** del WebSocket (5 s de plazo), nunca en la URL; se compara con `timingSafeEqual`.
- `/ws/editor` exige un `Origin` de `FBC_ALLOWED_ORIGIN`. `/ws/mcp` **rechaza cualquier `Origin`**: una página web no puede hacerse pasar por cliente MCP.
- Autorización explícita en el editor (botón «Agente (MCP)» de la cabecera): el usuario conecta con el token y **autoriza el proyecto abierto**. Sin autorización, toda herramienta devuelve `editor_disconnected/not_authorized`. La autorización vive solo en esa conexión: se pierde al recargar, al desconectar, al revocar o si se abre otro proyecto. El companion y el editor comprueban el proyecto por separado.
- Mensajes de hasta 40 MB, JSON validado con zod en cada sentido; un mensaje inválido cierra el canal (4400). Un editor nuevo sustituye al anterior (4409).
- Los errores no filtran rutas ni `e.message`; los detalles van a la consola del companion.

## Variables de entorno

| Variable | Dónde | Significado |
| --- | --- | --- |
| `FBC_TOKEN` | proceso MCP (obligatoria) | Token que imprime el companion. |
| `FBC_URL` / `FBC_PORT` | proceso MCP | Dirección del companion (por defecto `http://127.0.0.1:47321`). |
| `FBC_IMPORT_DIRS` | proceso MCP | Directorios permitidos para `import_asset`. |
| `FBC_MAX_IMPORT_BYTES` | proceso MCP | Máximo por archivo importado (por defecto 20 MiB). |
| `FBC_EXPORT_DIR` | proceso MCP | Directorio donde `export_image` y `export_kdp_pdf` escriben los archivos. Sin él, no se exporta. |
| `FBC_ALLOWED_ORIGIN`, `FBC_PORT`, `FBC_TOKEN` | companion | Como en el Paso 7. |

## Pruebas automatizadas

- `packages/core/test/mcp.test.ts`: esquemas, errores y mensajes del canal.
- `apps/companion/test/bridge.test.ts`: acceso (Host, Origin, token), autorización, reenvío, timeout, tope, sustitución del editor.
- `apps/companion/test/mcpFiles.test.ts`, `mcpServer.test.ts`: lectura segura de archivos y servidor MCP con un cliente del SDK en memoria.
- `apps/companion/test/mcpStdio.test.ts`: cliente del SDK por stdio contra el proceso real, el companion real y un editor simulado que ejecuta `applyCommand`; negociación de versiones.
- `apps/editor/test/mcpExecutor.test.ts`, `mcpBridge.test.ts`, `mcpPanel.test.tsx`: ejecución en el editor, puente y diálogo ES/CA.
- `apps/editor/e2e/mcp.spec.ts` (Playwright, editor y companion reales, cliente MCP del SDK por stdio): añadir texto aparece en pantalla y se guarda; revisión obsoleta devuelve conflicto sin mutar; estilo, importación y fondo; revocar corta el acceso.

## Verificación manual (no automatizable)

El SDD pide al menos dos clientes MCP compatibles o un cliente y una batería independiente. La batería automatizada usa el cliente del SDK; **MCP Inspector y un segundo cliente real (Claude Code) se comprueban a mano** con estos pasos.

Preparación común:

1. `pnpm install` y, en una terminal, `pnpm --filter @free-book-cover/companion start` (anote el token que imprime; por defecto `http://127.0.0.1:47321` y orígenes `http://localhost:5173`).
2. En otra, `pnpm dev` y abra `http://localhost:5173`.
3. En el editor: **Agente (MCP)** → dirección `http://127.0.0.1:47321` y token → **Conectar** → **Autorizar este proyecto**. Anote el ID del proyecto (aparece truncado; `get_canvas_state` devuelve el completo).

### MCP Inspector

1. `npx @modelcontextprotocol/inspector -e FBC_TOKEN=<token> -e FBC_IMPORT_DIRS=$HOME/Pictures pnpm --silent --dir /ruta/al/repo/apps/companion mcp`
2. En la interfaz del Inspector: **Connect**; en *Tools* → *List Tools* deben verse las trece herramientas con sus esquemas.
3. `get_canvas_state` sin argumentos: devuelve `projectId` y `revision`.
4. `add_text_element` con `projectId`, `expectedRevision` = la revisión leída y `text`: el texto aparece en el lienzo y en «Capas de texto»; el estado pasa a «Guardado».
5. Repita la misma llamada con la revisión antigua: `isError` con `conflict`, y el documento no cambia.
6. `import_asset` con una imagen de `FBC_IMPORT_DIRS` y después `apply_background` con el `assetId` devuelto.
7. En el editor, **Revocar autorización** y repita `get_canvas_state`: `editor_disconnected/not_authorized`.

### Segundo cliente real: Claude Code

1. `claude mcp add kdp-cover --env FBC_TOKEN=<token> --env FBC_IMPORT_DIRS=$HOME/Pictures -- pnpm --silent --dir /ruta/al/repo/apps/companion mcp`
2. En una sesión de Claude Code, `/mcp` debe mostrar `kdp-cover` conectado con trece herramientas.
3. Pida: «Lee el estado del lienzo y añade el texto "Prueba MCP" con fuente Georgia». Debe aparecer en el editor.
4. Pida añadir otro texto usando deliberadamente la revisión anterior (o edite algo en el editor entre medias): el cliente debe recibir el conflicto y reintentar tras releer.
5. Compruebe en el editor que **Deshacer** revierte el cambio hecho por el agente.

Si algo falla: sin respuesta → revise que el companion esté en marcha y el token; `no_companion`/`no_editor` indican qué eslabón falta; `not_authorized` significa que el proyecto no está autorizado en el editor.

## Limitaciones conocidas

- Un único editor conectado a la vez (el más reciente gana) y un único proyecto autorizado.
- El proceso MCP no se reconecta solo de forma proactiva: lo hace en la siguiente llamada.
- `import_asset` e `import_font` solo admiten rutas locales dentro de `FBC_IMPORT_DIRS`.
- `export_kdp_pdf` necesita el editor conectado al companion de preimpresión (basta con la conexión de MCP); las pruebas visuales (PNG de prueba y mapa de gama) solo se ven en el editor.
- Los tipos de informe/comprobación del companion siguen duplicados respecto a core (deuda del Paso 7, sin tocar).
