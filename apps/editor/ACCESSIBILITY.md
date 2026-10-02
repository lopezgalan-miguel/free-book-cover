# Accesibilidad del editor (SDD §6, R-10)

Revisión del Paso 9. Se comprueba de forma automática y se documenta lo que queda fuera.

## Qué se comprueba y dónde

| Aspecto | Comprobación | Dónde |
| --- | --- | --- |
| Nombres, roles y estructura | axe-core (WCAG 2.0/2.1/2.2 A y AA) sobre la vista principal, cada panel, el diálogo de exportación y una cubierta KDP con avisos; escritorio y móvil. 0 violaciones | `apps/editor/e2e/a11y.spec.ts` |
| Contraste de texto | Ratios de los tokens de `index.css` en las superficies donde se usan; mínimo 4,5:1 | `apps/editor/test/contrast.test.ts` (Vitest) y axe (`color-contrast`) en el DOM real |
| Objetivos táctiles | Todo control visible del diseño móvil (barra, pestañas, hoja y escenario) mide al menos 44 × 44 px; la prueba mide más de 40 controles | `a11y.spec.ts`, proyecto `mobile` |
| Teclado en la hoja inferior | Foco atrapado (40 Tab y 10 Mayús+Tab sin salir), Escape cierra y el foco vuelve a la pestaña que la abrió; flechas, Inicio y Fin recorren la barra de pestañas | `a11y.spec.ts` y `test/mobileContainer.test.tsx` |
| Orden de foco (escritorio) | Cabecera → capas → controles; cada parada tiene nombre | `a11y.spec.ts` |
| Alternativa numérica | Posición, tamaño y rotación con campos numéricos (`GeometryPanel`), también en la pestaña Lienzo móvil | `test/panels.test.tsx` |

Diálogos (exportación, MCP y hoja inferior) comparten el hook `useModal`: foco al abrir, Tab cíclico, Escape y retorno del foco.

## Contraste de tokens

El mockup usaba tonos que no llegan a AA para texto pequeño. Se oscurecieron los tokens de texto (la jerarquía se mantiene: tinta > subtle > muted/faint) y el botón de acento lleva texto oscuro.

| Token | Mockup | Ahora | Sobre panel | Sobre fondo | Sobre ficha | Sobre blanco |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `muted` | `#a49b8c` (2,59:1 sobre panel) | `#6b6458` | 5,52 | 4,96 | 4,85 | 5,85 |
| `subtle` | `#8c8578` (3,45:1) | `#5e584d` | 6,65 | 5,98 | 5,84 | 7,05 |
| `faint` | `#c4bcac` (1,89:1) | `#736c5f` | 4,90 | 4,41 (no se usa ahí) | 4,31 (no se usa ahí) | 5,20 |
| `accent-dark` | `#8c6f47` (4,42:1) | `#7a6038` | 5,56 | 5,00 | 4,89 | 5,90 |
| `on-accent` (nuevo) | blanco (3,24:1 sobre el acento) | `#2b2824` | | | | 4,53 sobre `accent` |
| `ink` | `#2b2824` | igual | 13,83 | 12,43 | 12,15 | 14,67 |
| `danger` / `ok` | igual | igual | 5,14 / 5,66 | | | 5,45 / 6,01 |

Avisos (`warn-ink` sobre `warn-bg` 5,27; `danger-ink` sobre `danger-bg` 7,86) y `chip-ink` también cumplen.

### Excepciones documentadas

- **El acento `#a98a5f` como color de texto** (3,05:1 sobre el panel) no llega a 4,5:1: solo se usa como borde, anillo de foco y relleno de botón (componentes de interfaz, mínimo 3:1 según 1.4.11). Cuando una etiqueta necesita el tono, se usa `accent-dark`.
- **Controles deshabilitados** (opacidad reducida) están exentos de contraste por WCAG.
- **Superposiciones del escenario** (zoom y fondo, texto blanco sobre `rgba(0,0,0,.4)` sobre el lienzo oscuro): axe no puede calcularlo sobre `canvas`; los botones son blanco sobre negro al 40 % sobre el fondo del escenario (cálculo manual: más de 10:1 con los tres tonos de escenario, sin contar el lienzo).

## Fuera de alcance / pendiente

- Lectores de pantalla reales (VoiceOver, TalkBack): no probados; se garantiza estructura y nombres con axe y el árbol de roles.
- El lienzo Fabric no expone sus elementos a tecnología asistiva; la alternativa es la lista de capas y el panel numérico.
- Pellizcar para ampliar en el lienzo táctil no está implementado: el zoom es con los botones del escenario.
