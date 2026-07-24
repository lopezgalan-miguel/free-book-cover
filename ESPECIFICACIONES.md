# Editor de portadas de libros — Especificaciones

Aplicación de front para **añadir texto de alta calidad sobre imágenes** con
múltiples fuentes, estilos y colores, preview en tiempo real y exportación sin
pérdida de calidad. Pensada como PWA (React + Vite) y empaquetable a **Android**
y, después, **iOS** con Capacitor.

> Este documento es la fuente de verdad del proyecto. El modelo de dominio vive
> en código en [`src/types/editor.ts`](src/types/editor.ts); aquí se documenta
> el porqué, la arquitectura y el plan de trabajo.

---

## 1. Objetivo

Una herramienta "casi como un Word" para portadas: el usuario escribe y ve el
resultado al instante sobre su imagen (como al crear una *story* de Instagram),
elige tipografías (incluidas fuentes externas propias), colores y estilos, ajusta
el tamaño del lienzo y exporta el resultado a resolución completa.

### Principios

- **Mobile First**, pero mantenible y seguro en cualquier tamaño.
- **Componetizable y reutilizable**: piezas pequeñas con una responsabilidad.
- **Legible y escalable**: nombres claros, un único modelo de dominio, features
  aisladas.
- **Calidad primero**: tipografías vectoriales y export a resolución real.

---

## 2. Requisitos funcionales

| Área | Requisito |
| --- | --- |
| **Texto** | Añadir múltiples bloques de texto independientes, arrastrables sobre el lienzo. |
| **Fuentes** | Catálogo de fuentes de alta calidad + **carga de fuentes externas** (`.ttf`/`.otf`/`.woff`). |
| **Estilo** | Negrita, cursiva, subrayado, mayúsculas, alineación, tamaño, interlineado, espaciado, sombra, contorno y **curvatura**. |
| **Color** | Selección por *color picker*, por **código hexadecimal** y por paleta de muestras. |
| **Preview** | Vista **en tiempo real** fiel a la exportación (como una *story*). |
| **Lienzo** | Redimensionar libremente. Accesos directos a formatos (16:9, 4:3, 1:1, KDP…) y **ancho/alto en píxeles por teclado**. |
| **Imagen** | Subir imagen de fondo; encaje *cover*/*contain*; reposicionar arrastrando. |
| **Export** | Elegir formato de salida (**PNG/JPEG/WebP/PDF**) **sin perder calidad** respecto al original. |
| **Idiomas** | Interfaz **bilingüe castellano/catalán**, con selector CA/ES y preferencia recordada entre sesiones. Textos externalizados en un catálogo (nunca literales en los componentes). |

---

## 3. Stack técnico

- **React 19 + Vite 6 + TypeScript** (estricto).
- **Tailwind CSS v4** (vía `@tailwindcss/vite`) con **tokens de diseño** en
  `src/index.css` (`@theme`). Responsive y Mobile First.
- **Fuentes de UI autoalojadas** (`@fontsource`, subconjunto latin — cubre ES/CA)
  importadas en `src/index.css`: sin CDN de terceros, la tipografía es idéntica
  online y offline, y va incluida en el precaché de la PWA.
- **Zustand** para el estado global tipado del editor y para la preferencia de
  idioma (persistida en `localStorage`).
- **i18n propio y ligero** (sin dependencias externas): catálogo de mensajes
  tipado (`es`/`ca`) + hook `useT()`; castellano por defecto.
- **vite-plugin-pwa** para la PWA instalable (offline + manifest).
- **Capacitor** para empaquetar a Android/iOS (capa `platform/`).
- **Canvas + SVG** para el render: preview en DOM/SVG, exportación rasterizada a
  resolución real con `<canvas>`.

### Decisiones de calidad de exportación

El preview en pantalla es una **vista escalada**. Al exportar, `renderToCanvas`
rasteriza a la **resolución real** del lienzo (p.ej. 1600×2560) y `exporters`
serializa al formato elegido. Las posiciones y tamaños se guardan en
**porcentaje** del lienzo, de modo que el diseño es independiente de la
resolución y el resultado exportado es idéntico proporcionalmente al preview.

---

## 4. Arquitectura y estructura

Organización **por features** (cada dominio funcional agrupa su UI y su lógica),
con un núcleo compartido (`core`, `store`, `types`, `utils`, `sharedComponents`).

```
src/
├─ main.tsx  ·  App.tsx          # arranque y composición de vistas
├─ types/
│  └─ editor.ts                  # modelo de dominio — fuente única de verdad
├─ views/Home/Home.tsx · useMediaQuery.ts   # composición de la pantalla del editor
├─ features/
│  ├─ canvas/    Stage.tsx · TextBlock.tsx · useDrag.ts   # preview en tiempo real
│  ├─ text/      TextPanel.tsx                            # contenido y estilo
│  ├─ fonts/     FontPanel.tsx · useFontLoader.ts         # fuentes + carga externa
│  ├─ color/     ColorPanel.tsx                           # picker · hex · paleta
│  ├─ canvasSize/ SizePanel.tsx · presets.ts             # tamaño y presets
│  └─ export/    ExportDialog.tsx                         # formato y descarga
├─ i18n/  config.ts · messages.ts · useI18n.ts · LanguageSwitcher.tsx  # bilingüe ES/CA
├─ store/editorStore.ts          # estado global (Zustand, tipado)
├─ core/  renderToCanvas.ts · curvedText.ts · exporters.ts  # render y export
├─ sharedComponents/  Slider.tsx · Toggle.tsx · Sheet.tsx   # primitivas reutilizables
├─ platform/  files.ts           # abstracción web ↔ Capacitor
└─ utils/  clamp.ts · hex.ts · download.ts                # utilidades puras
```

### Flujo de datos (unidireccional)

```
UI (paneles)  ──acciones──▶  editorStore (estado)  ──selectores──▶  Stage (preview)
                                     │
                                     └── al exportar ──▶ renderToCanvas ▶ exporters ▶ platform/files
```

- Los componentes **no guardan estado de dominio**: leen del store con
  selectores y mutan con acciones. Así el preview es reactivo y el modelo
  permanece coherente.
- Todo dato que entra al modelo se **valida/normaliza** en `utils` (hex, clamp).

### Contrato de cada pieza

Cada fichero de `src/` empieza con un comentario `CONTRATO` en castellano que
describe **qué hace** y **cómo lo hará**. Es el índice vivo de responsabilidades.

---

## 5. Modelo de dominio (resumen)

Definido en [`src/types/editor.ts`](src/types/editor.ts). Piezas clave:

- **`TextBlock`** — una capa de texto: contenido, posición (en % del lienzo),
  tipografía, color y efectos (sombra, contorno, curvatura).
- **`CanvasImage`** — imagen de fondo con encaje (*cover*/*contain*) y offset.
- **`CanvasSize`** — dimensiones reales de salida en px.
- **`CanvasPreset`** — accesos directos de tamaño (KDP, proporciones…).
- **`EditorState`** — proyecto completo (serializable a JSON).

> Regla: el modelo es **serializable** (sin funciones ni referencias al DOM),
> para guardar/restaurar proyectos y exportar sin ambigüedad.

---

## 6. Convenciones de código

- **TypeScript estricto**; sin `any`. Interfaces para las *props* de cada
  componente.
- **Arrow functions en todo el proyecto**: toda función, incluyendo componentes
  React, se define como `const Foo = (...) => ...`. Esto unifica el estilo y
  evita inconsistencias entre utilidades, hooks, lógica de `core` y componentes.
- **Parámetros con nombre descriptivo**: en lugar de `_props`, `_input`, `_options`,
  etc., se usa el nombre del componente o función como prefijo seguido de `Props`,
  `Input`, `Options`, etc. Ejemplos: `toggleProps`, `sliderProps`, `textBlockProps`,
  `dragOptions`, `curvedTextInput`, `renderInput`, `canvas`, `format`.
- **Nombres legibles**: verbo + objeto en acciones (`addBlock`, `setImage`),
  sustantivos claros en datos.
- **Imports absolutos** con alias `@/` (configurado en Vite y tsconfig).
- **Componentes de presentación** sin lógica de dominio; la lógica vive en el
  store, `core` y `utils`.
- **Estilos con tokens** de Tailwind (`bg-panel`, `text-ink`, `text-accent`…),
  nunca colores "mágicos" repartidos por los componentes.
- **Textos vía i18n**: ningún literal visible en los componentes; todo texto de
  UI se pide con `t('clave')` y vive en `i18n/messages.ts` con su versión
  castellana y catalana (el catálogo obliga a traducir ambas o no compila).
- Un fichero, una responsabilidad; primitivas reutilizables en
  `sharedComponents`.

---

## 7. Seguridad y robustez

- **Validación en la frontera**: colores (hex) y medidas (clamp) se sanean antes
  de tocar el estado.
- **Ficheros del usuario**: se valida extensión/tipo de imágenes y fuentes; las
  *object URLs* se revocan tras su uso.
- **Sin dependencias innecesarias**: menos superficie de ataque y builds
  ligeros.
- **PWA offline**: la app funciona sin red una vez instalada (incluidas las
  fuentes de la interfaz, autoalojadas en el build).

---

## 8. Plan de acción por fases

### ✅ Fase 1 — Cimientos (este nivel)

- [x] Estructura de carpetas y ficheros con su **contrato** en castellano.
- [x] Configuración: Vite, TypeScript estricto, Tailwind v4, PWA, Capacitor.
- [x] **Tokens de diseño** y estilos base (Mobile First).
- [x] Modelo de dominio (`types/editor.ts`) y **store** inicial (Zustand).
- [x] Utilidades puras (`clamp`, `hex`, `download`) y `presets`.
- [x] **Home** según mockups: shell responsive del editor (cabecera + Stage;
  paneles fijos en escritorio, barra de pestañas + hoja inferior `Sheet` en
  móvil), bilingüe ES/CA. Los paneles y el Stage se montan como stubs.
- [x] **i18n bilingüe ES/CA**: catálogo tipado, store persistido, `useT()` y
  selector CA/ES (castellano por defecto). Los paneles nacerán ya traducidos.

### Fase 2 — Preview y edición de texto

- [ ] `Stage` + `TextBlock`: render fiel del proyecto y selección.
- [ ] `useDrag`: arrastrar bloques e imagen de fondo.
- [ ] `TextPanel`: textarea con preview en tiempo real y controles de estilo.
- [ ] `Sheet`, `Slider`, `Toggle` operativos.

### Fase 3 — Fuentes y color

- [ ] `FontPanel` + `useFontLoader`: catálogo y **carga de fuentes externas**.
- [ ] `ColorPanel`: picker + hex + paleta.

### Fase 4 — Lienzo y exportación

- [ ] `SizePanel`: presets y ancho/alto por teclado.
- [ ] `renderToCanvas` + `curvedText` + `exporters`: **export sin pérdida**.
- [ ] `ExportDialog`: elegir formato y descargar.

### Fase 5 — Empaquetado nativo

- [ ] `platform/files` con Capacitor (Filesystem/Share).
- [ ] Build Android; validar flujo; después iOS.

---

## 9. Puesta en marcha

```bash
npm install     # instalar dependencias
npm run dev     # arrancar en desarrollo (http://localhost:5173)
npm run build   # build de producción (dist/)
npm run preview # previsualizar el build

# Nativo (cuando toque la Fase 5)
npm run build && npx cap add android && npm run cap:sync
```

---

## 10. Estado actual

Cimientos completos. La **Home** ya compone el editor según los mockups:
cabecera con marca, dimensiones del lienzo, selector ES/CA y botón Exportar;
Stage al centro; en escritorio (≥ lg) paneles laterales fijos (`SizePanel` a la
izquierda; `TextPanel`, `FontPanel` y `ColorPanel` a la derecha) y en móvil
barra inferior de pestañas con hoja inferior (`Sheet`) que aloja el panel
activo. Todo el texto sale del catálogo i18n. Los paneles, el `Stage` y el
`ExportDialog` siguen como *stubs* con su **contrato** documentado, listos para
implementarse fase a fase.
