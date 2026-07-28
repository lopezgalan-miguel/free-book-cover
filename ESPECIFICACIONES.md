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
| **Textura** | Rellenar el texto con una **imagen subida por el usuario** (JPG/PNG/WebP), con encaje *cover*/*contain* y opacidad. Sustituye al color mientras está puesta; al quitarla se recupera el color anterior. |
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
- **Fuentes autoalojadas** (`@fontsource`, subconjunto latin — cubre ES/CA)
  importadas en `src/index.css`: sin CDN de terceros, la tipografía es idéntica
  online y offline, y va incluida en el precaché de la PWA. Aplica tanto a las
  fuentes de **interfaz** (IBM Plex Sans/Mono) como al **catálogo de portadas**
  (Playfair Display, Cormorant Garamond, Montserrat…): de cada familia del
  catálogo se importan los pesos 400 y 700, suficientes para las muestras del
  panel y para los estilos habituales de una portada. Las fuentes que sube el
  usuario se registran en caliente con `FontFace` (ver `useFontLoader`).
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
│  ├─ canvas/    Stage.tsx · TextBlock.tsx · CurvedTextView.tsx · useDrag.ts  # preview
│  ├─ text/      TextPanel.tsx                            # contenido y estilo
│  ├─ fonts/     FontPanel.tsx · useFontLoader.ts         # fuentes + carga externa
│  ├─ style/     TexturePicker.tsx · useTextureUpload.ts   # textura del texto
│  ├─ color/     ColorPanel.tsx                           # picker · hex · paleta
│  ├─ canvasSize/ SizePanel.tsx · presets.ts             # tamaño y presets
│  └─ export/    ExportDialog.tsx                         # formato y descarga
├─ i18n/  config.ts · messages.ts · useI18n.ts · LanguageSwitcher.tsx  # bilingüe ES/CA
├─ store/editorStore.ts          # estado global (Zustand, tipado)
├─ core/  renderToCanvas.ts · curvedText.ts · exporters.ts  # render y export
├─ sharedComponents/  Button.tsx · Slider.tsx · Toggle.tsx · Sheet.tsx · Toast.tsx
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
  tipografía, color y efectos (sombra, contorno, **textura**, curvatura).
- **`BlockTexture`** — imagen que rellena el texto de un bloque (`src`,
  `fileName`, encaje y opacidad). Es una **propiedad del bloque**, no una capa
  aparte: el relleno del texto es o un color o una textura, nunca los dos.
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

## 8. Fases hechas

Historial de cómo se construyó el editor, fase a fase. **Todas están cerradas**;
lo que queda por hacer vive en el apartado 9, ya no por fases sino por
prioridad. Se conserva porque cada fase documenta el *porqué* de sus decisiones,
y esas decisiones siguen vigentes en el código.

### ✅ Fase 1 — Cimientos

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

### ✅ Fase 1.5 — Paneles maquetados (hecha)

- [x] `SizePanel`, `TextPanel`, `FontPanel` y `ColorPanel` con su **layout
  visual** según los mockups y todo el texto vía i18n. Siguen SIN cablear al
  store (valores fijos, controles no controlados): eso es la Fase 2A.
- [x] `Stage` + `TextBlock` + `useDrag`: preview real, selección, arrastre de
  bloques, edición inline con doble clic y redimensionado del marco con asas
  (esto último va más allá del mockup y se conserva).

### ✅ Fase 2A — Cablear los paneles al store (hecha)

Los paneles ya están maquetados: aquí se les da vida sin tocar su layout.

- [x] `Slider` y `Toggle` operativos, y los paneles pasan a usarlos en lugar de
  repetir su markup en línea.
- [x] `presets.ts` alineado con los mockups (añadir `wrap` 3828×2775; `r169` a
  2560×1440) y con **claves i18n** en vez de etiquetas en castellano fijas.
- [x] `SizePanel`: consumir `presets.ts` (fin de la lista duplicada en local),
  marcar el preset activo con `activePresetId`, inputs de ancho/alto controlados
  (`clamp(100, 10000)` → `setSize(..., 'custom')`) y subida de imagen real con
  validación de tipo y revocado de la *object URL* anterior.
- [x] `TextPanel`: la selección sale de `selectedBlockId`; todos los controles
  escriben con `patchSelected`.
- [x] `ColorPanel`: picker, hex (a través de `normalizeHex`) y paleta escribiendo
  en el bloque seleccionado. El campo hexadecimal mantiene un borrador local
  mientras se teclea (un color a medio escribir no es válido) y lo descarta al
  salir si nunca llegó a serlo.
- [x] `Stage`: arrastre de la imagen de fondo (reusando `useDrag` sobre
  `offsetX/offsetY`, invirtiendo el eje porque `background-position` va al revés
  que el dedo) y publicar su escala con `onZoomChange` para que la cabecera de
  escritorio muestre el `%` de zoom como en el mockup. Deseleccionar pasa a ser
  cosa del clic sin arrastre: recolocar el fondo ya no pierde la capa activa.
- [x] Acciones nuevas de store: `setImageFit`, `setImageOffset`, `centerImage`.
- [x] Panel de imagen completo: botones **Rellenar / Ajustar / Centrar** y la
  pista de arrastre, visibles solo cuando hay imagen.
- [x] Efectos completos: slider de intensidad de sombra y slider de grosor de
  contorno + su color, ambos condicionados a su toggle.

### ✅ Fase 2B — Reestructurar los paneles según los mockups (hecha)

- [x] Partir `SizePanel` en `ImagePanel` (imagen y encaje) y `SizePanel`
  (presets y píxeles).
- [x] Extraer `LayerList` (capas reales del store: seleccionar y eliminar) con
  dos presentaciones: lista vertical en escritorio y chips con scroll
  horizontal en móvil.
- [x] Partir `TextPanel` en `TextPanel` (solo el contenido) y `StylePanel`
  (peso, B/I/U/AA, alineación, sliders y efectos).
- [x] `Home` escritorio: panel derecho en el orden del mockup —
  **Texto → Fuente → Estilo → Color → Efectos** — y estado vacío
  ("Selecciona una capa…") que cubre el panel entero, no solo un bloque.
- [x] `Home` móvil: **cinco** pestañas (Texto, Fuente, Color, Estilo, Lienzo).
  Texto = `LayerList` + `TextPanel` + "Eliminar capa"; Lienzo = `ImagePanel` +
  `SizePanel`. El selector ES/CA sigue en la cabecera.
- [x] Ampliar el catálogo i18n con las claves nuevas de esta fase (`panel.image.*`,
  `panel.layers.remove`, `panel.style.*` y `home.tab.style`). Las de exportación
  y toast son de la Fase 4; los nombres de peso ("Regular 400") no se traducen:
  son valores CSS, como el nombre de la familia.

### ✅ Fase 3 — Fuentes y color (hecha)

- [x] Autoalojar el catálogo de portadas con `@fontsource` (peso variable donde
  existe) y unificarlo en un único `FONT_CATALOG` — la lista vivía duplicada
  dentro de `FontPanel` y solo cargaba una de las 13 familias que ofrecía. Los
  `@font-face` se declaran en `coverFonts.css`: el CSS de los paquetes trae
  alfabetos que no se usan y renombra las familias ('Lora Variable'), y el
  nombre de la familia es un dato del proyecto que no puede cambiar.
- [x] `FontPanel`: selección real contra el bloque activo (`patchSelected`) y
  grupo "Personalizada" alimentado por `customFonts` del store.
- [x] `useFontLoader.loadCustomFont`: registro con `FontFace`, validación por
  extensión (el MIME de las fuentes no es fiable), nombre de familia único para
  que una subida no tape a una empaquetada, y acción `addCustomFont` en el
  store. El pegamento con la UI vive en `useFontUpload`, en paralelo a
  `useImageUpload`.
- [x] Sombra con **color propio** (`shadowColor`) y opacidad derivada de
  `shadowIntensity`: era negra fija al 60 %, así que sobre el lienzo oscuro no
  se distinguía y el efecto parecía no aplicarse. `hexToRgba` compone el color
  del modelo (siempre opaco) con la opacidad del render.

### ✅ Fase 3.5 — Textura de letra (hecha)

Funcionalidad nueva de los mockups del 28/07/2026. Se hizo en este orden —el
modelo primero, la pantalla al final— y su parte de **exportación** cae en la
Fase 4.

- [x] **Modelo**: `BlockTexture` + campo `texture: BlockTexture | null` en
  `TextBlock` (por defecto `null`). Textura y color son el mismo relleno: con
  textura puesta manda ella y `color` queda en reserva para cuando se quite.
- [x] **Store**: acción `setSelectedTexture(texture | null)` que **revoca la
  object URL anterior** antes de escribir la nueva; `removeBlock` revoca también
  la textura del bloque que borra. La revocación vive en el store, no en la UI:
  repartida por los paneles, basta olvidarla una vez para filtrar memoria.
  `patchSelectedTexture` acompaña a la anterior para encaje y opacidad: no
  tocan el `src`, así que no hay nada que revocar, y evita que el panel tenga
  que recomponer el objeto del modelo.
- [x] **Subida**: `features/style/useTextureUpload.ts`, gemelo de
  `useImageUpload`, reutilizando su `ACCEPTED_TYPES` (JPG/PNG/WebP) por
  importación y devolviendo el error como clave i18n (comparte
  `panel.image.invalidType`: mismos formatos, mismo mensaje). Nace en `cover`
  al 100 %.
- [x] **Preview**: relleno del texto en `TextBlock` con `background-clip: text`
  (texto recto). La opacidad va en una capa recortada al texto, **no** en el
  elemento entero, para no apagar contorno y sombra: el texto editable se queda
  con `-webkit-text-fill-color: transparent` (conserva contorno y sombra, que
  se dibujan sobre la geometría del glifo) y encima va una copia no interactiva
  con la imagen. Mientras se edita el bloque manda el color: la copia pinta
  `block.text`, que aún no lleva lo tecleado, y quedaría desfasada sobre el
  texto real. El `<pattern>` SVG del texto curvo llega con la Fase 4.
- [x] **Panel**: `TexturePicker` dentro de *Efectos*, entre Contorno y
  Curvatura: fila «Textura» + «Quitar», botón punteado con miniatura y, con
  textura puesta, encaje *Rellenar/Ajustar* y slider de opacidad. Un solo
  componente para móvil y escritorio. Claves i18n `panel.style.texture*`.

### ✅ Fase 4 — Curvatura y exportación (hecha)

- [x] `computeCurvedText` + rama `curve !== 0` en `TextBlock`: la geometría es
  una Bézier cuadrática que se publica a la vez como `pathD` (para el
  `<textPath>` del preview, en `CurvedTextView`) y como puntos + recorrido por
  longitud de arco (`pointAtDistance`), que es lo que necesita el canvas para
  repartir los glifos. Una sola geometría para los dos caminos: con dos, el
  preview y la exportación se separarían. Mientras se edita el bloque vuelve al
  texto plano, porque el arco pinta `block.text` y aún no lleva lo tecleado.
- [x] `renderToCanvas` a resolución real + `exportCanvas`
  (PNG/JPEG/WebP/PDF): **export sin pérdida**. El PDF se escribe a mano (seis
  objetos, imagen RGB con `/FlateDecode` vía `CompressionStream`) en vez de
  añadir una librería de cientos de KB al bundle de la PWA.
- [x] **Textura en el export** (Fase 3.5): `background-clip: text` no existe en
  Canvas 2D; se reproduce pintando los glifos en un canvas intermedio del
  bloque y componiendo la imagen con `source-in`, respetando encaje y opacidad.
- [x] `ExportDialog` en sus dos formas: modal centrado en escritorio (rejilla
  2×2 de formatos, slider de calidad para JPEG/WebP, nota de imprenta,
  Cancelar/Descargar) y contenido de hoja en móvil. Un solo componente: cambia
  el envoltorio, no los controles ni la lógica.
- [x] `Toast` compartido para confirmar la exportación. Lo pinta `Home` y no el
  diálogo: al exportar, el diálogo se cierra y se llevaría el aviso con él.

Dos cosas que salieron al probarlo y quedan escritas para no repetirlas:

- Las tipografías las carga `renderToCanvas` (`ensureFontsLoaded`) antes de
  pintar. `document.fonts.ready` NO basta: el navegador solo descarga una
  familia cuando el DOM la usa, y aquí se pinta en un canvas, así que sin
  pedirlas expresamente la portada se exportaba con la fuente de sustitución.
- El bloque sin marco explícito envuelve al llegar al borde del lienzo, igual
  que el `max-width: 100%` del preview; sin ese límite el texto largo se salía
  del lienzo exportado en vez de partirse en dos líneas.
- El lienzo **sin imagen** se exporta con un color base liso, no con las rayas
  del preview: esas rayas son el aviso de "aquí falta una imagen", del mismo
  grupo que el marco de selección, y eso no se exporta.

Con la Fase 4 cerrada, **el producto hace ya lo que promete**: escribir sobre
una imagen y exportar el resultado a resolución real sin pérdida. Todo lo que
queda es red de seguridad, acabado y empaquetado, así que a partir de aquí el
plan deja de ir por fases numeradas y va por **prioridad**.

---

## 9. Pendiente, por prioridad

### P1 — Red de seguridad: tests y lint

Lo primero porque es lo que permite tocar el resto sin miedo, y porque hoy **no
hay ninguna comprobación automática**: las fases 3.5 y 4 se validaron a mano,
navegador contra navegador, y eso no se puede repetir en cada cambio.

- [ ] **ESLint 9** (flat config + `typescript-eslint` + `eslint-plugin-react-hooks`
  + `eslint-plugin-react-refresh`). `package.json` declara `"lint": "eslint ."`
  pero ESLint **no está instalado**: el script está roto desde el primer día.
- [ ] **Vitest en tres entornos**: `unit` (node) para lógica pura —`utils`,
  `editorStore`, `presets`, integridad del catálogo i18n, geometría de
  `computeCurvedText`—, `dom` (jsdom + Testing Library) para el cableado de los
  paneles contra un store real, y `browser` (Playwright/Chromium) para
  `renderToCanvas` y `exportCanvas`, que es donde hace falta un motor de verdad.
- [ ] Umbrales de cobertura con fallo duro: 90 % en `store`/`core`/`utils`,
  70 % en `features`/`sharedComponents`.
- [ ] Aserción clave del export: **el mismo proyecto exportado a 1600 y a 3200 px
  sale proporcionalmente idéntico**. Es la promesa del producto escrita como test.

### P2 — Cabos sueltos de las fases 3.5 y 4

Diferencias conocidas entre preview y exportación, más los literales que se
escaparon del catálogo. Son pequeñas y están localizadas; van antes del acabado
porque afectan al resultado que se lleva el usuario.

- [ ] **Subrayado en texto curvo**: el preview lo pinta (`CurvedTextView`) pero
  `renderToCanvas` no lo dibuja en la rama curva (`drawCurvedBlock` no llama a
  `drawUnderlines`). O se pinta en el export, o se retira del preview.
- [ ] `TextBlock`: dos `aria-label` en castellano fijo, fuera del catálogo i18n.
- [ ] `messages.ts`: la traducción catalana de `block.subtitle.default` sigue
  siendo la castellana ("un subtítulo evocador" → "un subtítol evocador"). Es el
  defecto que debería destapar en rojo el test de integridad del catálogo (P1).

### P3 — Acabado móvil y accesibilidad

- [ ] `Stage`: padding del escenario 14 px en móvil (hoy 32 fijo).
- [ ] Altura de la hoja alineada con el mockup (≈52 % del alto) sin romper la
  hoja de exportación ni las pestañas más largas (hoy 75 %).
- [ ] Asas de redimensionado con área táctil ~24 px manteniendo el aspecto
  pequeño; revisar que el doble toque para editar no compita con el arrastre.
- [ ] `padding-bottom` de área segura en la barra de pestañas (la hoja ya lo tiene).
- [ ] `aria-pressed`/`aria-checked` en todos los botones de estado, foco visible
  y objetivos táctiles ≥ 44 px donde el mockup lo permita.
- [ ] Pasada final por el mockup, pestaña a pestaña, a 390 × 844.

### P4 — Empaquetado nativo (Capacitor)

**Al final, por decisión de producto**: la PWA ya es usable y exporta, así que
el empaquetado no bloquea a nadie y conviene abordarlo con la red de seguridad
de P1 ya puesta.

- [ ] `platform/files` con Capacitor (Filesystem/Share). Hoy solo tiene la vía
  web (`downloadBlob`), que es justo el punto único de divergencia previsto.
- [ ] Interceptar el **botón atrás de Android** con confirmación, para no perder
  el trabajo.
- [ ] Build Android; validar flujo; después iOS.

### Fuera de alcance (por ahora)

Deshacer/rehacer y guardar/restaurar proyectos (el modelo ya es serializable, se
podrá añadir sin tocar nada más), vista "Mis portadas", reordenar capas
(z-index), plantillas, filtros sobre la imagen, PDF en CMYK (el actual es
`DeviceRGB`) e integración continua.

---

## 10. Puesta en marcha

```bash
npm install     # instalar dependencias
npm run dev     # arrancar en desarrollo (http://localhost:5173)
npm run build   # build de producción (dist/)
npm run preview # previsualizar el build

# Nativo (cuando toque la P4)
npm run build && npx cap add android && npm run cap:sync
```

---

## 11. Estado actual

**El editor está completo de punta a punta**: se escribe sobre la imagen, se ve
en tiempo real y se exporta a resolución real. Ya no queda ningún *stub* en
`src/`: `renderToCanvas`, `exporters`, `curvedText` y `loadCustomFont` están
implementados. Cada pieza mantiene su **contrato** documentado en cabecera.

**Ya vivo:**

- Modelo de dominio, store y i18n bilingüe con preferencia persistida.
- `Stage` + `TextBlock`: preview fiel, selección, arrastre, edición inline y
  redimensionado del marco.
- Los cinco paneles cableados al store (texto, fuente, estilo, color, lienzo),
  en columnas fijas en escritorio y en hoja inferior con pestañas en móvil.
- Catálogo de 15 tipografías autoalojadas + carga de fuentes propias del usuario.
- Color, sombra con color propio, contorno y **textura de letra** (Fase 3.5).
- **Curvatura** (SVG `<textPath>` en el preview, glifos sobre el arco en el
  canvas) y **exportación** a PNG/JPEG/WebP/PDF a resolución real (Fase 4).

**Lo que falta** está en el apartado 9, ordenado por prioridad: red de seguridad
(tests + lint), cabos sueltos de las fases 3.5 y 4, acabado móvil y
accesibilidad, y por último el empaquetado nativo con Capacitor.

**Verificación**: `npm run typecheck` y `npm run build` pasan. `npm run lint`
**está roto** (ESLint no instalado) y **no hay tests**: es justo lo que abre la
lista de prioridades.
