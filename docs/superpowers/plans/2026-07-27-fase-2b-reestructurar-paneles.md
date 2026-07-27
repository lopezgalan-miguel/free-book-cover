# Fase 2B · Reestructurar los paneles según los mockups — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** partir los paneles maquetados en componentes con una sola responsabilidad, cablearlos al store y recolocarlos en `Home` según los mockups, en escritorio y en móvil.

**Arquitectura:** cada panel deja de ser un fichero que lo hace todo y pasa a componer piezas pequeñas que ya conocen el store (`ImagePanel`, `SizePanel`, `LayerList`, `TextPanel`, `StylePanel`). `Home` solo compone y decide qué se ve en cada tamaño de pantalla. Se sigue el patrón ya establecido en `features/canvasSize/` durante la Fase 2A: un fichero por componente, contrato en cabecera, el estado en el store y los componentes de presentación sin acceso a él.

**Stack:** React 19 + TypeScript estricto, Zustand, Tailwind v4, Vite.

## Restricciones globales

- Todo el texto visible pasa por i18n (`useT()`), con la clave dada de alta en **ES y CA** en `src/i18n/messages.ts`. Ninguna cadena literal en JSX.
- Ninguna clave de i18n contiene datos (medidas, números): eso se deriva del store. Regla fijada en la Fase 2A.
- Cada componente nuevo abre con su bloque `CONTRATO ·` en castellano, como el resto de `src/`.
- `types/editor.ts` no importa nada: es el modelo serializable. Los tipos que necesiten `MessageKey` viven en su feature.
- `Button` (`src/sharedComponents/Button.tsx`) es el botón de toda la interfaz. La variante `outline` no fija color ni tamaño de texto: los pone quien la usa. Nunca emitir dos utilidades Tailwind del mismo eje.
- Mobile First: se maqueta el móvil y se amplía a escritorio con `lg:`.
- El proyecto **no tiene runner de tests** (`package.json` solo expone `dev`, `build`, `preview`, `lint`, `typecheck`; `eslint` ni siquiera está instalado). La verificación de cada tarea es, por tanto, `npm run typecheck && npm run build` **más una comprobación manual guiada** en `npm run dev`. Cada tarea trae la suya, con pasos y resultado esperado. Si en algún momento se añade Vitest, estas comprobaciones son la lista de casos a automatizar primero.

## Ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/store/editorStore.ts` (modificar) | Añade `setImageFit`, `setImageOffset`, `centerImage`. |
| `src/sharedComponents/Slider.tsx` (modificar) | Deja de ser stub: control deslizante real. |
| `src/sharedComponents/Toggle.tsx` (modificar) | Deja de ser stub: interruptor real. |
| `src/features/image/ImagePanel.tsx` (crear) | Imagen de fondo: subida, encaje, centrado, pista de arrastre. |
| `src/features/image/useImageUpload.ts` (crear) | Lógica de subida: validación de tipo y revocado de la object URL. |
| `src/features/layers/LayerList.tsx` (crear) | Lista de capas reales: seleccionar y eliminar. |
| `src/features/canvasSize/SizePanel.tsx` (modificar) | Se queda solo con `PresetGroup` + `SizeInputs`. |
| `src/features/text/TextPanel.tsx` (modificar) | Solo el contenido del bloque (textarea). |
| `src/features/text/StylePanel.tsx` (crear) | Peso, B/I/U/AA, alineación, sliders y efectos. |
| `src/views/Home/Home.tsx` (modificar) | Nuevo orden en escritorio y cinco pestañas en móvil. |
| `src/i18n/messages.ts` (modificar) | Claves nuevas, en cada tarea que las necesite. |

Las claves de i18n **no** se dejan para una tarea final: cada tarea da de alta las suyas en ES y CA. Una tarea que añade texto sin traducir está incompleta.

---

## Tarea 1: Acciones de imagen en el store

Cierra un pendiente de la Fase 2A del que depende `ImagePanel`. Sin esto, la tarea 3 no puede hacer nada más que subir el fichero.

**Ficheros:**
- Modificar: `src/store/editorStore.ts:157-170` (interfaz `EditorActions`) y el cuerpo del `create` (junto a `setImage`, línea 222).

**Interfaces:**
- Consume: `CanvasImage` y `ImageFit` de `src/types/editor.ts:87-96`.
- Produce: `setImageFit(fit: ImageFit) => void`, `setImageOffset(offsetX: number, offsetY: number) => void`, `centerImage() => void`. Las tres son no-op si `image` es `null`.

- [ ] **Paso 1: Declarar las acciones en `EditorActions`**

```ts
  setImage: (image: CanvasImage | null) => void;
  /** Cambia el encaje del fondo. No hace nada si no hay imagen. */
  setImageFit: (fit: ImageFit) => void;
  /** Coloca el fondo. Ambos valores en % (0–100). No-op sin imagen. */
  setImageOffset: (offsetX: number, offsetY: number) => void;
  /** Devuelve el fondo al centro (50/50). No-op sin imagen. */
  centerImage: () => void;
```

- [ ] **Paso 2: Implementarlas junto a `setImage`**

```ts
  setImageFit: (fit) =>
    set((state) => (state.image ? { image: { ...state.image, fit } } : {})),

  setImageOffset: (offsetX, offsetY) =>
    set((state) =>
      state.image
        ? {
            image: {
              ...state.image,
              offsetX: clamp(offsetX, 0, 100),
              offsetY: clamp(offsetY, 0, 100),
            },
          }
        : {},
    ),

  centerImage: () =>
    set((state) => (state.image ? { image: { ...state.image, offsetX: 50, offsetY: 50 } } : {})),
```

Añade el import: `import { clamp } from '@/utils/clamp';`. El acotado vive aquí y no en la interfaz porque el arrastre del `Stage` también llamará a `setImageOffset` y no debe poder sacar el fondo del lienzo.

- [ ] **Paso 3: Verificar**

Ejecuta: `npm run typecheck`
Esperado: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/store/editorStore.ts
git commit -m "feat(store): acciones de encaje, desplazamiento y centrado de la imagen"
```

---

## Tarea 2: `Slider` y `Toggle` operativos

Ambos son hoy stubs que devuelven `null` (`Slider.tsx:25`, `Toggle.tsx`). La tarea 5 los necesita, y `TextPanel` ya repite su markup en línea cinco veces.

**Ficheros:**
- Modificar: `src/sharedComponents/Slider.tsx`, `src/sharedComponents/Toggle.tsx`.

**Interfaces:**
- Consume: nada.
- Produce: `Slider` con la firma ya definitiva de `SliderProps` (`label`, `value`, `min`, `max`, `step?`, `valueLabel?`, `onChange`), y `Toggle` con `ToggleProps` (leer el fichero: la firma también está fijada; respetarla).

- [ ] **Paso 1: Implementar `Slider` respetando la firma existente**

Sustituye el cuerpo (deja el contrato de cabecera intacto, ampliándolo si hace falta) por el markup que `TextPanel.tsx:85-96` repite hoy a mano:

```tsx
export const Slider = ({ label, value, min, max, step = 1, valueLabel, onChange }: SliderProps) => (
  <div>
    <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
      <span>{label}</span>
      <span className="font-mono text-[11px] text-muted">{valueLabel ?? value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-2 w-full cursor-pointer rounded-lg bg-line accent-accent"
    />
  </div>
);
```

Ojo: el markup actual lleva `mb-3` dentro del propio `input` en unos sitios y no en otros. El margen es cosa de quien lo coloca, no del control: no lo incluyas aquí.

- [ ] **Paso 2: Implementar `Toggle` con el markup de `TextPanel.tsx:136-145`**

```tsx
export const Toggle = ({ checked, onChange, label }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-5 w-9 cursor-pointer rounded-full border-none ${
      checked ? 'bg-accent' : 'bg-line'
    }`}
  >
    <span
      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm ${
        checked ? 'left-[18px]' : 'left-1'
      }`}
    />
  </button>
);
```

No uses `Button` aquí: un interruptor es `role="switch"`, no un botón con etiqueta, y su caja no tiene nada que ver con las variantes de `Button`.

- [ ] **Paso 3: Verificar**

Ejecuta: `npm run typecheck && npm run build`
Esperado: ambos sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/sharedComponents/Slider.tsx src/sharedComponents/Toggle.tsx
git commit -m "feat(ui): Slider y Toggle operativos"
```

---

## Tarea 3: `ImagePanel` — sacar la imagen de `SizePanel`

**Ficheros:**
- Crear: `src/features/image/useImageUpload.ts`, `src/features/image/ImagePanel.tsx`
- Modificar: `src/features/canvasSize/SizePanel.tsx:25-37` (quitar el bloque de imagen), `src/i18n/messages.ts`
- Modificar: `src/views/Home/Home.tsx` (montar `ImagePanel` sobre `SizePanel` en la columna izquierda)

**Interfaces:**
- Consume: `setImage`, `setImageFit`, `centerImage` del store (tarea 1); `Button` de `@/sharedComponents/Button`.
- Produce: `ImagePanel` (sin props) y `useImageUpload(): { onFileChange: (event: ChangeEvent<HTMLInputElement>) => void; error: MessageKey | null }`.

- [ ] **Paso 1: Dar de alta las claves nuevas en ES y CA**

En `src/i18n/messages.ts`, en ambos idiomas:

```ts
    'panel.image.title': 'Imagen de fondo',      // CA: 'Imatge de fons'
    'panel.image.fill': 'Rellenar',              // CA: 'Omplir'
    'panel.image.fit': 'Ajustar',                // CA: 'Ajustar'
    'panel.image.center': 'Centrar',             // CA: 'Centrar'
    'panel.image.dragHint': 'Arrastra la imagen sobre el lienzo para recolocarla',
    // CA: 'Arrossega la imatge sobre el llenç per recol·locar-la'
    'panel.image.invalidType': 'Formato no admitido: usa JPG, PNG o WebP',
    // CA: 'Format no admès: fes servir JPG, PNG o WebP'
```

Las claves `panel.size.backgroundImage`, `panel.size.uploadImage`, `panel.size.changeImage` y `panel.size.formats` ya existen: reutilízalas, no las dupliques bajo el prefijo nuevo.

- [ ] **Paso 2: Escribir `useImageUpload.ts`**

```ts
/**
 * CONTRATO · useImageUpload
 * -------------------------
 * Convierte el fichero elegido por el usuario en la imagen de fondo del store.
 *
 * Cómo lo hará:
 *  - Solo admite JPG, PNG y WebP; cualquier otro tipo se rechaza sin tocar el
 *    store y devuelve la clave del mensaje de error para que el panel lo pinte.
 *  - Revoca la object URL anterior antes de crear la nueva: sin esto cada
 *    cambio de imagen filtra memoria durante toda la sesión.
 *  - La imagen nace centrada y en modo 'cover'.
 */

import { useState, type ChangeEvent } from 'react';
import type { MessageKey } from '@/i18n/messages';
import { useEditorStore } from '@/store/editorStore';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const useImageUpload = () => {
  const image = useEditorStore((state) => state.image);
  const setImage = useEditorStore((state) => state.setImage);
  const [error, setError] = useState<MessageKey | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo fichero
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('panel.image.invalidType');
      return;
    }

    if (image?.src.startsWith('blob:')) URL.revokeObjectURL(image.src);

    setError(null);
    setImage({
      src: URL.createObjectURL(file),
      fileName: file.name,
      fit: 'cover',
      offsetX: 50,
      offsetY: 50,
    });
  };

  return { onFileChange, error };
};
```

- [ ] **Paso 3: Escribir `ImagePanel.tsx`**

Mueve tal cual el `<label>` de subida que hoy está en `SizePanel.tsx:29-36` (con su `<input type="file">`, ahora con `onChange={onFileChange}` y `accept="image/jpeg,image/png,image/webp"`), y añade debajo, **solo cuando `image` no es `null`**:

- una fila con tres `Button`: Rellenar (`variant="outline" size="sm"`, `isActive={image.fit === 'cover'}`, `onClick={() => setImageFit('cover')}`), Ajustar (igual con `'contain'`) y Centrar (`onClick={centerImage}`, sin estado activo: es una acción, no un modo);
- la pista `t('panel.image.dragHint')` en `text-[10.5px] text-muted`;
- el nombre del fichero (`image.fileName`) truncado con `truncate`.

Si `error` no es `null`, píntalo bajo el `<label>` en `text-[10.5px] text-danger`.

Recuerda que `outline` no fija color de texto: pásalo en `className` (`text-ink-soft`, o `text-accent-strong` cuando esté activo).

- [ ] **Paso 4: Vaciar el bloque de imagen de `SizePanel` y montar `ImagePanel` en `Home`**

Borra de `SizePanel.tsx` el primer `<div className="border-b border-line-soft p-4">` completo (el de la imagen). En la columna izquierda de `Home` (`Home.tsx`, el `<aside className="w-[264px] …">`) monta `<ImagePanel />` encima de `<SizePanel />`.

- [ ] **Paso 5: Verificar**

Ejecuta: `npm run typecheck && npm run build`, y después `npm run dev`.

Comprobación manual, en escritorio:
1. Sube un PNG → aparece en el `Stage`, y salen los tres botones y la pista. **Rellenar** queda marcado.
2. Pulsa **Ajustar** → el encaje cambia y el botón marcado pasa a ser Ajustar.
3. Intenta subir un `.gif` o un `.txt` → aparece el mensaje de formato no admitido y la imagen anterior **no** cambia.
4. Sube una segunda imagen y, en la pestaña Memory de las DevTools, confirma que no crece el número de blobs retenidos.
5. Cambia a CA con el selector → todos los textos nuevos están traducidos.

- [ ] **Paso 6: Commit**

```bash
git add src/features/image src/features/canvasSize/SizePanel.tsx src/views/Home/Home.tsx src/i18n/messages.ts
git commit -m "feat(image): ImagePanel con subida validada, encaje y centrado"
```

---

## Tarea 4: `LayerList` — capas reales

Hoy `SizePanel.tsx:14-18` pinta un `layerSamples` inventado que no tiene nada que ver con el store.

**Ficheros:**
- Crear: `src/features/layers/LayerList.tsx`
- Modificar: `src/features/canvasSize/SizePanel.tsx` (quitar el bloque de capas y `layerSamples`), `src/i18n/messages.ts`

**Interfaces:**
- Consume: `blocks`, `selectedBlockId`, `selectBlock`, `removeBlock`, `addBlock` del store; `Button`.
- Produce: `LayerList` con `LayerListProps { layout: 'column' | 'row' }`. `'column'` es la lista vertical de escritorio; `'row'`, los chips con scroll horizontal de móvil.

- [ ] **Paso 1: Escribir `LayerList.tsx`**

Toma el markup que hoy tiene `SizePanel` para las capas y sustituye los datos de mentira por `blocks` del store. Cada fila:

- se pinta con `Button` (`variant="outline"`, `size="sm"`, `isActive={block.id === selectedBlockId}`) y `onClick={() => selectBlock(block.id)}`;
- muestra `Aa` con `style={{ fontFamily: block.fontFamily }}`, el `block.text` truncado y debajo `block.fontFamily` en `text-[10px] text-muted`;
- lleva a la derecha un `Button variant="danger" size="none"` con `×` que llama a `removeBlock(block.id)` y `aria-label={t('panel.layers.remove')}`.

El botón `×` va **dentro** del botón de la fila en el markup actual, y un botón anidado en otro botón es HTML inválido. Sácalo: la fila pasa a ser un `<div className="flex items-center gap-2">` que contiene el `Button` de selección (con `flex-1`) y, hermano suyo, el `Button` de borrar.

`layout` solo cambia el contenedor: `flex flex-col gap-1.5` en `'column'`; `flex gap-1.5 overflow-x-auto` con las filas en `flex-none` en `'row'`.

La cabecera (título "Capas de texto" + botón `+` que llama a `addBlock`) va dentro de `LayerList`, no en quien lo monta.

- [ ] **Paso 2: Claves nuevas en ES y CA**

```ts
    'panel.layers.remove': 'Eliminar capa',   // CA: 'Eliminar capa'
```

`panel.size.textLayers` y `panel.size.addLayer` ya existen: reutilízalas.

- [ ] **Paso 3: Quitar de `SizePanel` el bloque de capas y la constante `layerSamples`**

`SizePanel` queda entonces reducido a su cabecera de contrato, `PresetGroup` ×2 y `SizeInputs`. Actualiza su contrato de cabecera: ya no gestiona ni la imagen ni las capas.

- [ ] **Paso 4: Verificar**

Ejecuta: `npm run typecheck && npm run build`, y después `npm run dev`.

Comprobación manual:
1. Arrancado, la lista muestra los tres bloques del mockup y el título aparece marcado (es el `selectedBlockId` inicial, `'block-title'`).
2. Pulsa otra capa → se marca esa, y en el `Stage` cambia el bloque seleccionado.
3. Pulsa `+` → aparece una capa nueva y queda seleccionada.
4. Borra una capa con `×` → desaparece de la lista y del `Stage`; si era la seleccionada, la selección salta a la primera que quede.
5. Edita el texto de un bloque en el `Stage` (doble clic) → la etiqueta de la lista se actualiza.

- [ ] **Paso 5: Commit**

```bash
git add src/features/layers src/features/canvasSize/SizePanel.tsx src/i18n/messages.ts
git commit -m "feat(layers): LayerList con las capas reales del store"
```

---

## Tarea 5: Partir `TextPanel` en `TextPanel` + `StylePanel`

**Ficheros:**
- Crear: `src/features/text/StylePanel.tsx`
- Modificar: `src/features/text/TextPanel.tsx` (queda solo el textarea), `src/i18n/messages.ts`

**Interfaces:**
- Consume: `blocks`, `selectedBlockId`, `patchSelected` del store; `Slider` y `Toggle` (tarea 2); `Button`.
- Produce: `TextPanel` y `StylePanel`, ambos sin props.

- [ ] **Paso 1: Extraer el bloque seleccionado en un hook local compartido**

Ambos paneles necesitan lo mismo. Crea `src/features/text/useSelectedBlock.ts`:

```ts
/**
 * CONTRATO · useSelectedBlock
 * ---------------------------
 * Devuelve el bloque de texto seleccionado, o `null` si no hay ninguno.
 * Lo usan `TextPanel` y `StylePanel` para no repetir el cruce entre
 * `blocks` y `selectedBlockId`.
 */

import { useEditorStore } from '@/store/editorStore';

export const useSelectedBlock = () => {
  const blocks = useEditorStore((state) => state.blocks);
  const selectedBlockId = useEditorStore((state) => state.selectedBlockId);
  return blocks.find((block) => block.id === selectedBlockId) ?? null;
};
```

Esto sustituye a la constante `const hasSelection = true` de `TextPanel.tsx:10`, que era maqueta.

- [ ] **Paso 2: Dejar `TextPanel` con solo el contenido**

Se queda el primer `<div>` (título + `<textarea>`). El textarea pasa a ser controlado: `value={block.text}` y `onChange={(event) => patchSelected({ text: event.target.value })}`. Borra del fichero el resto de secciones, la constante `weights` y `hasSelection`.

El estado vacío (`t('panel.text.noSelection')`) sale de aquí: en la tarea 6 pasa a cubrir el panel derecho entero, no un bloque suelto.

- [ ] **Paso 3: Escribir `StylePanel.tsx` con lo que sale de `TextPanel`**

Lleva el `<select>` de pesos (con `weights`), la fila de B/I/U/AA y alineación, los tres sliders y el bloque de efectos. Cablea todo con `patchSelected`:

Los nombres de campo salen de `TextBlock` (`src/types/editor.ts:31-84`) y son estos, sin inventar ninguno:

| Control | Campo | Escritura |
|---|---|---|
| `<select>` de peso | `fontWeight: number` | `patchSelected({ fontWeight: Number(event.target.value) })` |
| **B** | `fontWeight` | alterna 700 ↔ 400; `isActive={block.fontWeight >= 700}` |
| **I** | `italic: boolean` | `patchSelected({ italic: !block.italic })` |
| **U** | `underline: boolean` | `patchSelected({ underline: !block.underline })` |
| **AA** | `uppercase: boolean` | `patchSelected({ uppercase: !block.uppercase })` |
| ⇤ ⇔ ⇥ | `align: TextAlign` | `'left' \| 'center' \| 'right'`; `isActive={block.align === …}` |
| Slider tamaño | `fontSizePct: number` | min 2, max 26, step 0.5; `valueLabel={`${block.fontSizePct.toFixed(1)}%`}` |
| Slider interlineado | `lineHeight: number` | min 0.8, max 2.4, step 0.05 |
| Slider espaciado | `letterSpacing: number` | min -0.05, max 0.5, step 0.01; `valueLabel={`${block.letterSpacing.toFixed(2)}em`}` |
| Toggle sombra | `shadow: boolean` | + slider `shadowIntensity` (0–100) **solo si `shadow`** |
| Toggle contorno | `outline: boolean` | + slider `outlineWidth` y color `outlineColor` **solo si `outline`** |

Ojo con **AA**: en la maqueta parece un botón de tipografía, pero el campo es `uppercase`, que fuerza mayúsculas en el render sin tocar `text`.

`curve` también existe en `TextBlock` y su slider puede cablearse aquí igual que los demás, pero su render en el `Stage` es Fase 4: no esperes ver el efecto todavía.

- [ ] **Paso 4: Claves nuevas en ES y CA**

Da de alta las que pidan los controles de efectos que hoy no tienen texto (intensidad de sombra, grosor de contorno, color de contorno) bajo el prefijo `panel.style.*`. Comprueba antes cuáles de `panel.text.*` ya existen y reutilízalas.

- [ ] **Paso 5: Verificar**

Ejecuta: `npm run typecheck && npm run build`, y después `npm run dev`.

Comprobación manual:
1. Selecciona un bloque y escribe en el textarea → el texto cambia en el `Stage` en vivo.
2. Cambia el peso → cambia en el `Stage`; vuelve a seleccionar otro bloque y el `select` muestra **el peso de ese bloque**, no el anterior.
3. Pulsa alineación derecha → se marca ese botón y solo ese.
4. Mueve el slider de tamaño → el número de la derecha y el `Stage` cambian a la vez.
5. Activa la sombra → aparece su slider de intensidad; desactívala → desaparece.
6. Cambia a CA → todo traducido.

- [ ] **Paso 6: Commit**

```bash
git add src/features/text src/i18n/messages.ts
git commit -m "feat(text): TextPanel solo contenido y StylePanel cableado al store"
```

---

## Tarea 6: Recomponer `Home`

Va la última a propósito: recolocar piezas que aún estuvieran cambiando obligaría a rehacer esta tarea.

**Ficheros:**
- Modificar: `src/views/Home/Home.tsx`, `src/i18n/messages.ts`

**Interfaces:**
- Consume: todos los paneles de las tareas 3-5 y `useSelectedBlock`.
- Produce: nada que consuma otra tarea.

- [ ] **Paso 1: Escritorio — reordenar el panel derecho**

El `<aside className="w-[300px] …">` pasa al orden del mockup: **`TextPanel` → `FontPanel` → `StylePanel` → `ColorPanel` → efectos**. Los efectos ya viven dentro de `StylePanel`, así que en la práctica el orden es `TextPanel`, `FontPanel`, `StylePanel`, `ColorPanel`.

La columna izquierda queda: `ImagePanel`, `SizePanel`, `LayerList layout="column"`.

- [ ] **Paso 2: Escritorio — estado vacío de panel completo**

Cuando `useSelectedBlock()` devuelve `null`, el `<aside>` derecho entero se sustituye por el mensaje `t('panel.text.noSelection')` centrado. Hoy ese estado vive dentro de `TextPanel` y deja `FontPanel` y `ColorPanel` visibles y sin sentido. Quita ese `if` de `TextPanel` al moverlo aquí.

- [ ] **Paso 3: Móvil — cinco pestañas**

`HomeTab` (`Home.tsx:44`) pasa de cuatro a cinco valores: `'text' | 'font' | 'color' | 'style' | 'canvas'`. Añade la entrada de Estilo a `HOME_TABS` (`Home.tsx:52`) y a `SHEET_TITLE_KEY` (`Home.tsx:60`), con un icono coherente con los demás.

Contenido de cada hoja:
- **Texto** → `LayerList layout="row"` + `TextPanel` + botón "Eliminar capa"
- **Fuente** → `FontPanel`
- **Color** → `ColorPanel`
- **Estilo** → `StylePanel`
- **Lienzo** → `ImagePanel` + `SizePanel`

El selector ES/CA se queda donde está, en la cabecera.

- [ ] **Paso 4: Claves nuevas en ES y CA**

```ts
    'home.tab.style': 'Estilo',   // CA: 'Estil'
```

- [ ] **Paso 5: Verificar**

Ejecuta: `npm run typecheck && npm run build`, y después `npm run dev`.

Comprobación manual, en escritorio:
1. El panel derecho sale en orden Texto → Fuente → Estilo → Color.
2. Deselecciona (clic en el fondo del `Stage`) → **todo** el panel derecho se sustituye por el mensaje de "selecciona una capa".

En móvil (DevTools, 390×844):
3. Salen cinco pestañas y cada una abre su hoja con el contenido correcto.
4. En la pestaña Texto, los chips de capas hacen scroll horizontal y seleccionan.
5. La hoja Lienzo muestra imagen y presets, y pulsar un preset cambia el lienzo detrás de la hoja.

- [ ] **Paso 6: Commit**

```bash
git add src/views/Home/Home.tsx src/features/text/TextPanel.tsx src/i18n/messages.ts
git commit -m "feat(home): panel derecho reordenado, estado vacío completo y cinco pestañas en móvil"
```

---

## Al terminar

Marca en `ESPECIFICACIONES.md:229-245` las casillas de la Fase 2B que hayan quedado hechas, y repasa las de la 2A: las tareas 1 y 2 de este plan cierran dos de sus pendientes (acciones de imagen, `Slider`/`Toggle`). Quedarán aún sin hacer, de la 2A, el cableado de `ColorPanel` y el arrastre del fondo en el `Stage` con su porcentaje de zoom en la cabecera.
