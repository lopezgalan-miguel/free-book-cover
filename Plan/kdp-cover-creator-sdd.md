# KDP Cover Creator — Especificación para desarrollo guiado por especificaciones (SDD)

**Versión:** 0.4 · **Estado:** Propuesta actualizada · **Fecha:** 2026-10-02

> **Interpretación de SDD:** *Spec-Driven Development*. Este documento define el comportamiento esperado y sus pruebas de aceptación antes de redactar el plan técnico o implementar la aplicación. Las decisiones marcadas como «propuesta» requieren validación del responsable del producto.

## 1. Objetivo y alcance

Crear un editor gráfico web para diseñar cubiertas de libros y piezas digitales. Debe permitir guardar el diseño, producir una cubierta completa de **tapa blanda KDP** lista para su revisión de impresión —contraportada, lomo y portada en un único PDF— y exportar imágenes adaptadas a redes sociales.

El resultado se considerará satisfactorio cuando una persona pueda configurar las características físicas del libro, componer la cubierta, recuperar el proyecto, pasar una validación técnica de preimpresión y generar un PDF cuyas medidas, resolución y propiedades de color se hayan verificado. También debe poder crear y exportar una imagen para un destino digital concreto con sus dimensiones y formato comprobados. La aceptación final del archivo por KDP depende de su proceso de revisión y no puede garantizarse desde la aplicación.

### Alcance inicial propuesto

- Tapa blanda con sentido de lectura de izquierda a derecha.
- KDP como único perfil de impresión de esta versión. La adaptación a otras imprentas se evaluará después.
- Cubierta completa, piezas para Instagram y Facebook, y diseños digitales de tamaño libre. Se podrán añadir destinos mediante un catálogo de preajustes versionado.
- Edición local en un navegador moderno; proyectos y recursos guardados en el dispositivo. La interfaz se adapta a escritorio y a móvil (R-10).
- Interfaz en español y catalán (R-11).
- Un proyecto activo por sesión del editor.
- Integración MCP agnóstica del agente: cualquier cliente MCP compatible y autorizado podrá usar las herramientas del editor.

### Fuera del alcance inicial

- Tapa dura, cubierta interior, archivos del manuscrito, publicación en KDP y perfiles de entrega de otras imprentas.
- Colaboración simultánea y sincronización en la nube.
- Exportación PDF KDP desde un dispositivo sin el proceso local (D-10); en móvil se ofrecen la edición y las exportaciones digitales.
- Promesa de que un archivo será aprobado por KDP o por cualquier otra imprenta con especificaciones distintas.

## 2. Fuentes y reglas externas verificadas

La [guía oficial de cubiertas de tapa blanda de KDP](https://kdp.amazon.com/es_ES/help/topic/G201953020) exige un solo PDF con contraportada, lomo y portada; sangrado exterior de 0,125 pulgadas (3,175 mm); imágenes a un mínimo de 300 ppp al tamaño de uso; y texto de portada/contraportada al menos a 0,125 pulgadas dentro del corte. El texto en el lomo solo se admite a partir de 79 páginas y debe respetar su margen de seguridad. KDP recomienda CMYK para las imágenes, desaconseja mezclar espacios de color y advierte que elimina perfiles de color incrustados. El [calculador oficial de cubiertas](https://kdp.amazon.com/es_ES/cover-templates) proporciona medidas y plantillas según los datos de impresión. KDP recomienda que el PDF no supere los 40 MB por rendimiento y señala que los archivos de más de 650 MB no se convierten.

**Valores contrastados el 2026-10-02** (detalle y enlaces en `packages/core/src/kdp/sources.md`):

| Dato | Valor |
| --- | --- |
| Grosor de lomo por página | Blanco B/N 0,002252 in · crema B/N 0,0025 in · color estándar 0,002252 in · color premium 0,002347 in |
| Papel *groundwood* | KDP no publica grosor por página; **no se admite en esta versión** hasta contrastarlo con el calculador |
| Margen del texto del lomo | ≥ 0,0625 in a cada lado; tolerancia del lomo ± 0,0125 in |
| Texto | ≥ 7 pt; ≥ 0,125 in dentro del corte en portada y contraportada |
| Código de barras | Tamaño sugerido 2 × 1,2 in (mínimo 1,4 × 0,8 in), fondo blanco, ≥ 0,25 in del lomo y del corte; KDP lo coloca en la contraportada si no se aporta |
| Páginas | Mínimo 24 (72 en color estándar); el máximo depende de tamaño y papel |
| Tamaño de corte personalizado | 4–8,5 in de ancho y 6–11,69 in de alto |
| PDF | Transparencias aplanadas, fuentes incrustadas, sin marcas de corte, sin colores directos, sin cifrado |

Estas reglas pueden cambiar. Antes de implementar las fórmulas o aprobar una exportación para producción, se contrastarán con la documentación y la plantilla oficial vigentes. **La plantilla oficial será la referencia para casos que excedan las fórmulas simples de este documento.**

## 3. Decisiones de producto y arquitectura propuestas

| ID | Decisión | Motivo |
| --- | --- | --- |
| D-01 | El modo KDP genera una cubierta completa; «6 × 9 pulgadas» describe el tamaño de corte de cada cara, no el tamaño total del PDF. | El ancho total depende del lomo y del sangrado. |
| D-02 | Las dimensiones físicas, en pulgadas, son la fuente de verdad; los píxeles de vista previa son una representación. | Evita alterar la geometría al cambiar zoom o resolución de pantalla. |
| D-03 | El documento interno tendrá un esquema versionado propio. Fabric.js será el motor de edición y renderizado, no el contrato persistente ni el contrato MCP. | Permite validar, migrar y probar documentos sin depender del JSON privado del motor. |
| D-04 | Los fondos y las imágenes deben alcanzar 300 ppp **efectivos** al tamaño impreso. Escalar una imagen pequeña no corrige una resolución de origen insuficiente. | Evita declarar «lista para imprimir» una exportación que solo contiene más píxeles interpolados. |
| D-05 | Las guías, márgenes y avisos se ven en el editor y en la previsualización técnica; se excluyen del PDF final. | KDP no quiere marcas de corte ni elementos de plantilla en la cubierta entregada. |
| D-06 | La primera versión incorpora una cadena de preimpresión verificable: composición a 300 ppp, conversión controlada a CMYK, PDF de una página y comprobación posterior del archivo. | La salida de imprenta es un requisito de esta versión, no una mejora futura. |
| D-07 | MCP se implementará mediante un proceso puente local, conforme al protocolo, que exponga herramientas y se comunique con el editor abierto. | Evita acoplar el producto a Claude o a otro agente; una SPA aislada no es un servidor MCP externo. |
| D-08 | Los preajustes digitales son datos versionados con plataforma, destino, píxeles, formato y fecha de revisión; se pueden modificar sin alterar documentos existentes. | Los requisitos de las redes cambian y no conviene incrustarlos en el motor gráfico. |
| D-09 | Cada destino exportado se deriva del proyecto mediante una composición revisable. | Un recorte automático de una cubierta horizontal a una historia vertical puede ocultar texto o personajes. |
| D-10 | Un único proceso local en Node («companion») realiza la preimpresión (Ghostscript + perfil ICC, inspección con Poppler/qpdf) y actúa como puente MCP. El editor se comunica con él por un canal local autenticado. | Gestión de color y PDF fiables fuera del navegador; un solo componente local que instalar y mantener. |
| D-11 | Los textos de la interfaz se cargan de diccionarios por idioma (es, ca); el idioma no forma parte del documento. | Añadir idiomas sin tocar componentes ni proyectos. |

**Stack candidato, sujeto a prueba de compatibilidad al iniciar el plan técnico:** React y TypeScript, Vite, Fabric.js, una biblioteca de componentes accesibles con Tailwind CSS, IndexedDB para proyectos y recursos, Vitest para lógica pura y Playwright para flujos. La cadena de exportación de imprenta se ejecuta en el proceso local (D-10) con Ghostscript; `jsPDF` por sí sola no se considera prueba de conversión CMYK correcta. La cadena debe superar primero una prueba con inspección independiente del PDF resultante (entrega 1).

## 4. Modelo de documento

```text
Project {
  schemaVersion: number
  id: string
  name: string
  mode: "kdp-paperback" | "digital" | "freeform"
  printSetup?: {
    trimWidthIn: number
    trimHeightIn: number
    pageCount: number
    paperAndInk: supportedVariant
    readingDirection: "ltr"
  }
  canvas: { widthIn: number; heightIn: number; background: AssetRef | Color }
  digitalTargets?: Array<{ presetId: string; presetVersion: number; layoutOverrides: object }>
  elements: Array<TextElement | ImageElement | ShapeElement>
  assets: Array<{ id: string; kind: "image" | "font"; mimeType: string; metadata: object }>
  revision: number
}
```

- Cada elemento tiene un ID estable, posición, dimensiones, giro, orden de apilado y visibilidad. Los textos almacenan sus fragmentos estilizados; las imágenes referencian recursos locales, sin duplicar su contenido en cada operación.
- Las variantes para redes conservan los mismos recursos y texto base, pero pueden tener posiciones, tamaños, visibilidad y recortes propios por destino. No se modificará una variante aprobada al actualizar el catálogo de preajustes.
- Las coordenadas del documento se expresan en pulgadas o en una unidad normalizada derivada de ellas. La conversión a pantalla y a exportación ocurre en los bordes del sistema.
- El guardado incluye el esquema y las referencias de recursos. Al cargar una versión no compatible, la aplicación informa del problema y no sobrescribe el proyecto.
- Cada operación, venga de la interfaz o de MCP, valida el documento y aumenta `revision`. Una edición con revisión obsoleta se rechaza con un conflicto recuperable.

## 5. Requisitos funcionales y criterios de aceptación

### R-01. Configuración de la cubierta KDP

El usuario introduce tamaño de corte, número de páginas y variante de papel/tinta compatible. El editor calcula anchura del lomo y tamaño completo, muestra contraportada, lomo y portada, y permite comparar el resultado con una plantilla oficial.

Para tapa blanda, la fórmula base es `ancho = 2 × tamaño de corte horizontal + lomo + 2 × 0,125 in` y `alto = tamaño de corte vertical + 2 × 0,125 in`. El lomo depende de páginas y papel; sus valores se contrastarán con la guía vigente antes de codificarlos.

**Aceptación:** dado un conjunto válido de datos de impresión, cuando el usuario configura el proyecto, entonces ve las medidas físicas completas, los límites de cada zona y el valor del lomo; si cambia páginas o papel, se recalculan las zonas sin deformar automáticamente los elementos existentes y se avisa de elementos que quedan fuera.

### R-02. Lienzo libre y redimensión

El modo libre admite tamaño en píxeles, milímetros o pulgadas. Las medidas se normalizan a una unidad interna y se muestran en la unidad elegida. Cambiar el tamaño ofrece tres políticas explícitas para las imágenes afectadas: **recortar** sin distorsión, **ajustar** conservando proporción con espacio libre, o **estirar** con posible deformación. La política se aplica a los elementos seleccionados o al fondo, según la operación indicada en la interfaz.

**Aceptación:** dado un proyecto con una imagen, cuando se cambia el tamaño y se elige cada política, entonces la vista previa y la exportación producen el mismo encuadre; una operación de deshacer restaura las medidas y posiciones previas.

### R-03. Imágenes y recursos

El usuario puede cargar imágenes locales, colocarlas, recortarlas, moverlas y ajustar su orden. La aplicación lee dimensiones en píxeles, formato y tamaño de archivo; calcula los ppp efectivos a partir del tamaño físico visible en el PDF y muestra una advertencia si están por debajo de 300.

**Aceptación:** dado un recurso insuficiente para su tamaño impreso, cuando se selecciona o se exporta, entonces se muestra el valor de ppp efectivos y el elemento afectado; no se etiqueta el PDF como validado para impresión. Dado un recurso válido, se conserva su referencia al guardar y volver a abrir el proyecto.

Las importaciones respetan los límites de la sección 6. Se conserva el original; las miniaturas y vistas previas usan derivados de menor tamaño para no cargar cada imagen completa en memoria durante la edición.

### R-04. Texto y tipografías

El editor permite crear y mover bloques de texto, editar su contenido y aplicar fuente, tamaño, peso, cursiva, subrayado, mayúsculas y color a fragmentos seleccionados. También admite alineación, interlineado, sombra con intensidad, contorno con grosor y color, espaciado entre letras, rotación del bloque, **curvatura** (texto sobre un arco, de −100 a 100) y **textura** (relleno del texto con una imagen importada, sujeta a las reglas de R-03). Las fuentes `.ttf`, `.otf` y `.woff2` se cargan mediante `FontFace` si el navegador las admite y se guardan localmente. La licencia de uso de cada fuente es responsabilidad de quien la aporta.

**Aceptación:** dado un bloque con dos fragmentos de estilo distinto, cuando se guarda y reabre, entonces contenido y estilos se mantienen; si una fuente falla al cargar, el editor la identifica y evita una sustitución silenciosa en la exportación. Dado un bloque curvado y con textura, la vista previa y la exportación muestran la misma forma y el mismo relleno.

### R-05. Guías y comprobaciones KDP

El editor muestra sangrado, línea de corte, zonas seguras de texto, pliegues del lomo y zona reservada para código de barras cuando corresponda. Las guías siguen el tamaño y la variante elegidos. El texto del lomo se bloquea o marca como inválido si el número de páginas no cumple la regla vigente; para tapa blanda, la guía consultada sitúa el mínimo en 79 páginas.

**Aceptación:** dado un texto fuera de zona segura o un fondo que no cubre el sangrado, cuando se ejecuta la revisión, entonces se identifica el objeto y el problema; al exportar, ninguna guía aparece en el PDF. La comprobación automática se presenta como ayuda, no como aprobación de KDP.

### R-06. Guardado y recuperación

El proyecto y los recursos se guardan en IndexedDB. El usuario puede guardar manualmente y recuperar un proyecto tras recargar la página. Si se supera la cuota local, se informa antes de perder cambios y se ofrece descargar una copia de seguridad del proyecto, dividida en partes si su tamaño impide crear un único archivo sin agotar la memoria.

**Aceptación:** dado un proyecto con imagen y fuente aportada, cuando se guarda, recarga y abre, entonces se recuperan dimensiones, objetos, estilos y recursos; si falla el guardado, aparece un error explícito y el estado en memoria permanece disponible.

### R-07. Exportación

El modo libre y los destinos digitales exportan PNG, JPEG y WebP cuando la cadena de exportación soporte el formato. El modo KDP exporta un PDF de una página con tamaño físico exacto y sangrado, sin guías ni marcas. Antes de exportar se comprueban recursos, geometría, fuentes, resolución y color. Los errores que impiden cumplir las condiciones de preimpresión bloquean la etiqueta «listo para KDP»; se puede descargar una prueba marcada como no validada. El informe de preimpresión acompaña al PDF validado.

**Aceptación:** dado un proyecto KDP válido, cuando se exporta, entonces el PDF mide exactamente lo calculado, contiene una página con contraportada, lomo y portada en el orden correcto, y su mapa de píxeles alcanza 300 píxeles por pulgada del tamaño físico. Un inspector PDF independiente confirma el espacio de color CMYK de la imagen final, la ausencia de transparencias, marcas, cifrado y fuentes externas necesarias para la impresión. Dado un recurso de menos de 300 ppp efectivos, el informe identifica el problema y no concede el estado validado.

**Límite explícito:** «listo para KDP» significa que el archivo supera las comprobaciones técnicas definidas aquí; no garantiza coincidencia exacta del color impreso ni aprobación por KDP. La guía de KDP no fija en la fuente consultada un perfil ICC obligatorio y advierte que elimina perfiles incrustados. La conversión a CMYK deberá emplear una política de color documentada, generar una prueba visual y verificar el PDF final; no basta con cambiar una etiqueta de metadatos. La validación de esta versión se limita a KDP.

### R-08. Destinos digitales y redes sociales

El usuario puede iniciar un diseño digital o derivar variantes de un proyecto existente. El catálogo inicial incluye publicaciones de feed y formatos verticales de **imagen estática** para Instagram y Facebook, además de tamaños personalizados. Cada preajuste indica nombre del destino, relación de aspecto, píxeles, formatos de exportación y versión. La aplicación muestra el área visible y permite reajustar manualmente texto, imágenes y recortes para cada variante. Los números concretos del catálogo se comprobarán con la documentación de cada plataforma al implementarlo; el usuario siempre puede introducir un tamaño propio. La creación de vídeo para Reels o Stories queda fuera de este requisito.

**Aceptación:** dado un diseño base, cuando el usuario crea dos variantes con proporciones distintas, entonces puede revisar y ajustar cada encuadre por separado; exportar una variante produce exactamente los píxeles seleccionados y no altera las otras. El informe muestra formato, dimensiones, peso y destino elegido. Una actualización del catálogo no cambia retroactivamente el tamaño de una variante guardada.

### R-09. Herramientas MCP

El puente MCP local expone herramientas con esquemas de entrada y salida documentados para **cualquier cliente MCP compatible**. La integración utiliza el mismo conjunto de comandos y validaciones que la interfaz; no modifica directamente el JSON interno de Fabric.js. Las herramientas no dependen de un modelo o proveedor de IA concreto.

| Herramienta | Entrada principal | Resultado |
| --- | --- | --- |
| `get_canvas_state` | `projectId` | Documento resumido, IDs, medidas y `revision`. |
| `add_text_element` | `projectId`, `expectedRevision`, texto, estilos y posición | ID nuevo y revisión. |
| `update_element_style` | `projectId`, `expectedRevision`, `elementId`, propiedades permitidas | Elemento actualizado y revisión. |
| `import_asset` | `projectId`, tipo y recurso dentro de un límite configurado | ID de recurso y metadatos. |
| `apply_background` | `projectId`, `expectedRevision`, ID de recurso y política de ajuste | Fondo actualizado y revisión. |

`import_asset` sustituye la subida indiscriminada de datos base64 de tamaño arbitrario; el contrato técnico definirá transporte y límites. El proceso local solo acepta clientes configurados por el usuario y limita qué proyecto puede modificar. Los errores distinguen parámetros inválidos, recurso ausente, conflicto de revisión y editor desconectado.

**Aceptación:** dado un editor abierto y una conexión autorizada, cuando un cliente MCP añade texto, entonces el elemento aparece en pantalla y al guardar; si la revisión es antigua, la llamada no modifica el documento y devuelve un conflicto. Las pruebas de conformidad incluirán al menos dos clientes MCP compatibles o un cliente y una batería de conformidad independiente. El protocolo MCP y el transporte se implementarán según la [especificación oficial vigente](https://modelcontextprotocol.io/specification/versioning), fijando una versión concreta en el plan técnico.

### R-10. Interfaz adaptada a móvil

En pantallas estrechas el editor muestra barra superior, lienzo y una barra de pestañas (Texto, Fuente, Color, Estilo, Lienzo) que abre una hoja inferior con los mismos controles que los paneles de escritorio. Las capacidades de edición son las mismas; la exportación PDF KDP requiere el proceso local (D-10).

**Aceptación:** dado un proyecto abierto en un viewport móvil, cuando el usuario edita texto, fuente, color, estilo y lienzo desde la hoja inferior, entonces el documento resultante es idéntico al obtenido con las mismas operaciones en escritorio.

### R-11. Idiomas de la interfaz

La interfaz está disponible en español y catalán, con selector visible. El idioma elegido se recuerda en el dispositivo y no altera el proyecto.

**Aceptación:** dado cualquier panel, al cambiar de idioma todos los textos de la interfaz cambian sin recargar y sin modificar `revision`.

## 6. Requisitos de calidad

- **Exactitud geométrica:** conversiones de pulgadas, milímetros, puntos PDF y píxeles con pruebas de límites y tolerancia documentada; el PDF se verifica leyendo su tamaño de página, no solo inspeccionándolo visualmente.
- **Rendimiento:** zoom, selección y arrastre deben responder con fluidez en proyectos de referencia definidos antes de implementar; la exportación informa del progreso y no bloquea indefinidamente la interfaz.
- **Robustez:** importaciones no válidas y fallos de almacenamiento muestran errores recuperables. Ninguna llamada MCP puede dejar un documento parcialmente mutado.
- **Accesibilidad:** controles operables por teclado, nombres accesibles, contraste legible y alternativa numérica para posición, tamaño y rotación.
- **Privacidad:** los archivos permanecen en el dispositivo salvo una acción explícita de exportación o conexión MCP local.

### Límites de recursos de la primera versión

Son **límites de producto propuestos**, no límites impuestos por KDP ni por las redes. Se validarán en la prueba de rendimiento inicial con el equipo de referencia.

| Recurso | Límite | Tratamiento |
| --- | ---: | --- |
| Imagen importada | 100 MB comprimidos y 80 megapíxeles decodificados por archivo | Antes de importar se comprueba peso; tras leer cabeceras, dimensiones. Se rechaza con explicación si supera cualquiera de los dos. |
| Fuente importada | 20 MB por archivo | Se comprueba formato y carga antes de guardarla. |
| Proyecto guardado | 500 MB sumando originales, fuentes y documento | Aviso al llegar a 400 MB; se impide añadir recursos que superen el máximo. |
| Exportación digital | 50 megapíxeles por imagen | Se ofrece reducir dimensiones o exportar variantes por separado. |
| PDF KDP generado | Objetivo de 40 MB; máximo del producto de 200 MB | Se optimiza sin reducir la resolución efectiva bajo 300 ppp. Si no cabe, se informa y no se marca como listo. |

El límite de megapíxeles controla el consumo de memoria que el peso comprimido no revela. La exportación y la gestión de color podrán ejecutarse fuera del hilo principal y procesar el diseño por partes. El usuario nunca perderá su archivo original por una optimización automática.

## 7. Plan SDD por entregas verificables

Cada entrega comienza con sus escenarios de aceptación y pruebas de lógica pura. Después se implementa lo mínimo para satisfacerlos y se ejecuta una demostración manual del flujo completo. Un cambio de alcance requiere actualizar primero esta especificación. La viabilidad de la salida CMYK y la inspección independiente del PDF se prueban al principio porque condicionan la arquitectura de exportación.

1. **Prueba técnica de preimpresión:** generar una página de muestra CMYK y comprobarla con un inspector PDF independiente. Fijar la cadena tecnológica de conversión antes de construir el editor.
2. **Base y documento:** proyecto React/TypeScript, esquema versionado, comandos, guardado y recuperación. Prueba de ida y vuelta del documento.
3. **Composición visual:** motor de lienzo, imágenes, modos de ajuste, selección, zoom y deshacer. Pruebas de geometría y flujo de edición.
4. **Tipografía:** texto enriquecido, recursos de fuentes y persistencia. Prueba de reapertura y exportación con estilos mixtos.
5. **Variantes digitales:** catálogo versionado para Instagram y Facebook, ajustes por destino y exportación de imagen con dimensiones verificadas.
6. **Cubierta KDP:** configuración física, lomo, sangrado, guías y validaciones. Pruebas de fórmulas con casos de la plantilla oficial.
7. **Preimpresión completa:** exportación con inspección independiente de tamaño de página, resolución, espacio de color y ausencia de guías. Esta entrega debe pasar antes de declarar completa la versión.
8. **MCP local:** puente agnóstico del agente, esquemas de herramientas, control de revisiones y prueba extremo a extremo con clientes compatibles.
9. **Móvil y cierre:** interfaz móvil (R-10), pruebas de flujos críticos con Playwright en escritorio y móvil, revisión de accesibilidad y rendimiento, verificación de los límites de recursos y un archivo de muestra comprobado con el previsualizador de KDP cuando esté disponible.

## 8. Decisiones aún abiertas para el plan de implementación

1. **Importación de plantillas KDP:** usar la plantilla descargada solo como referencia visual opcional o automatizar la comparación geométrica. La salida debe contrastarse con la plantilla oficial en cualquier caso.
2. **Equipo de referencia:** definir navegador y memoria mínimos para comprobar que los límites propuestos —100 MB por imagen, 80 megapíxeles y 500 MB por proyecto— son utilizables sin agotar recursos.
3. **Versión MCP:** la especificación vigente es `2026-07-28` (sin *handshake* de inicialización); decidir si se admite también `2025-11-25` para clientes anteriores.
4. **Papel groundwood:** incorporarlo cuando KDP publique o el calculador confirme su grosor por página.
5. **Catálogo digital inicial:** confirmar qué ubicaciones concretas, además de feed y vertical de Instagram/Facebook, se ofrecerán de inicio. El tamaño personalizado ya cubre otros destinos.

La compatibilidad MCP con distintos agentes, la salida KDP con CMYK verificado, las variantes para redes y los límites cuantitativos ya están incorporados al alcance de la primera versión. Los puntos anteriores afinan su implementación. La adaptación a otras imprentas queda para una versión posterior, basada en sus requisitos concretos.
