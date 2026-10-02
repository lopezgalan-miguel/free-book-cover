# MCP local del companion (SDD R-09, D-07, D-10)

El companion expone el editor abierto a cualquier cliente MCP compatible (Claude Code, MCP Inspector, otros). Las herramientas no dependen de ningún modelo: emiten **comandos de `core`** que el editor ejecuta con `applyCommand` (revisión esperada, validación, historial y guardado). Fabric nunca se toca.

## Arquitectura

```
cliente MCP ──stdio──> proceso MCP (src/mcp/main.ts) ──WebSocket /ws/mcp──> companion (HTTP local) ──WebSocket /ws/editor──> editor (navegador)
```

- **Proceso MCP** (`pnpm --silent --dir apps/companion mcp`): lo lanza el cliente MCP por stdio. stdout es solo del protocolo; los avisos van a stderr. Es un cliente del companion que ya está en marcha (`pnpm --filter @free-book-cover/companion start`); conecta bajo demanda y reconecta en la llamada siguiente.
- **Companion**: el servidor HTTP del Paso 7 ahora acepta WebSocket en `/ws/editor` y `/ws/mcp`. Solo reenvía; no modifica documentos.
- **Editor**: ejecuta cada llamada con los comandos de `core`. Es la única vía de mutación, con deshacer/rehacer y persistencia.
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
| `add_text_element` | `projectId`, `expectedRevision`, `text`, `x?`, `y?`, `width?`, `fontFamily?`, `fontSizePt?`, `weight?`, `italic?`, `underline?`, `uppercase?`, `color?`, `align?`, `lineHeight?`, `letterSpacing?` | `elementId`, `revision`, `saved` |
| `update_element_style` | `projectId`, `expectedRevision`, `elementId`, `style` (propiedades permitidas según el tipo) | `element`, `revision`, `saved` |
| `import_asset` | `projectId`, `expectedRevision?`, `kind: "image"`, `path` | `assetId`, `revision`, `mimeType`, `widthPx`, `heightPx`, `sizeBytes`, `saved` |
| `apply_background` | `projectId`, `expectedRevision`, `assetId` o `color`, `fit?` (`cover`/`contain`/`fill`) | `revision`, `background`, `fit`, `saved` |

Los esquemas JSON de entrada y salida se publican en `tools/list` (generados con `z.toJSONSchema`). Notas:

- `get_canvas_state.projectId` es opcional (desviación respecto a la tabla del SDD) para que un cliente pueda descubrir el proyecto autorizado; el resto lo exige.
- `fontFamily` debe ser del catálogo del editor o una fuente subida al proyecto; otra cosa es `invalid_params` (el editor no sustituye fuentes en silencio).
- `update_element_style`: en textos admite `fontFamily`, `fontSizePt`, `weight`, `italic`, `underline`, `uppercase`, `color` (se aplican a todos los fragmentos), `align`, `lineHeight`, `letterSpacing`, `shadow`, `outline`, `curvature`; en formas `fill` y `stroke`; en imágenes `fit`; y en todos `x`, `y`, `width`, `height`, `rotation`, `visible`. `id`, `type` y `zIndex` no se pueden cambiar. Una propiedad que no aplica al tipo es `invalid_params`.
- `apply_background` aplica fondo y encuadre con un único comando (`setBackground` con `fit`): una revisión y un solo paso de deshacer.
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
2. En la interfaz del Inspector: **Connect**; en *Tools* → *List Tools* deben verse las cinco herramientas con sus esquemas.
3. `get_canvas_state` sin argumentos: devuelve `projectId` y `revision`.
4. `add_text_element` con `projectId`, `expectedRevision` = la revisión leída y `text`: el texto aparece en el lienzo y en «Capas de texto»; el estado pasa a «Guardado».
5. Repita la misma llamada con la revisión antigua: `isError` con `conflict`, y el documento no cambia.
6. `import_asset` con una imagen de `FBC_IMPORT_DIRS` y después `apply_background` con el `assetId` devuelto.
7. En el editor, **Revocar autorización** y repita `get_canvas_state`: `editor_disconnected/not_authorized`.

### Segundo cliente real: Claude Code

1. `claude mcp add kdp-cover --env FBC_TOKEN=<token> --env FBC_IMPORT_DIRS=$HOME/Pictures -- pnpm --silent --dir /ruta/al/repo/apps/companion mcp`
2. En una sesión de Claude Code, `/mcp` debe mostrar `kdp-cover` conectado con cinco herramientas.
3. Pida: «Lee el estado del lienzo y añade el texto "Prueba MCP" con fuente Georgia». Debe aparecer en el editor.
4. Pida añadir otro texto usando deliberadamente la revisión anterior (o edite algo en el editor entre medias): el cliente debe recibir el conflicto y reintentar tras releer.
5. Compruebe en el editor que **Deshacer** revierte el cambio hecho por el agente.

Si algo falla: sin respuesta → revise que el companion esté en marcha y el token; `no_companion`/`no_editor` indican qué eslabón falta; `not_authorized` significa que el proyecto no está autorizado en el editor.

## Limitaciones conocidas

- Un único editor conectado a la vez (el más reciente gana) y un único proyecto autorizado.
- El proceso MCP no se reconecta solo de forma proactiva: lo hace en la siguiente llamada.
- `import_asset` solo admite imágenes y rutas locales; las fuentes no se importan por MCP.
- Los tipos de informe/comprobación del companion siguen duplicados respecto a core (deuda del Paso 7, sin tocar).
