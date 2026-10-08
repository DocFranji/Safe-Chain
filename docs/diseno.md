# Diseño de la web: dos opciones de marca en prueba

## Cómo llegamos aquí

1. **Carreta de Sarchí y Fintech.** Primera prueba: dos mundos opuestos. La persona eligió no quedarse con ninguno.
   La Carreta le gustaba, pero por tan colorida perdía seriedad. La Fintech estaba bien, pero sin personalidad de
   marca, y su barra era del mismo color del fondo, así que el logo no destacaba.
2. **Lima, Cusuco y Ronda.** Tres mundos más, con las herramientas nuevas del repo. Siguen en el historial del
   PR DocFranji/Safe-Chain#28 (commit `9718868`) por si se quiere recuperar algo.
3. **Ahora, dos opciones que combinan las dos primeras**, como pidió la persona, sin límites para cambiar todo. Las
   dos tienen personalidad y buen branding, sirven para el hackathon y para un producto real después. Cada página
   está vestida según su función.
4. **Gente y movimiento.** La persona pidió fotos de personas, como en las páginas de Mastercard o PayPal, y
   animaciones en las dos opciones. Las fotos van en círculo con una órbita alrededor (el aro y el punto del logo) y
   todo entra con un gesto propio de cada marca.

Se cambian con la franja "Diseño en prueba" o con `?tema=sarchi|montana` antes del `#`. Las dos tienen modo oscuro:
sigue al teléfono, o se fija con `?modo=claro|oscuro` o el botón "Modo oscuro" de la franja.

**Cuando el equipo elija una:** se copia su archivo de `docs/disenos/` a `DESIGN.md`; se borran `web/src/lib/tema.ts`,
`web/src/components/SelectorTema.tsx`, el bloque de la otra opción en `web/src/index.css`, `web/src/temas.css` y
`web/src/landing/landing.css`, y su rueda (`RuedaSarchi.tsx` o `RuedaMontana.tsx`).

## Las dos opciones

### A · Sarchí: la carreta, en serio

- **THESIS.** La tanda es la carreta: hecha con orgullo y construida para durar. La seriedad sale de una regla de la
  referencia de Mastercard (awesome-design-md): los colores de la marca viven en la marca, no en la interfaz.
- **OWN-WORLD.** El rojo carreta #a31f1a es el campo de la marca (barra, portada, cierre). Del borde cuelga el fleco
  de la carreta, en un solo dorado. Los cuatro colores pintados (rojo, dorado, cobalto y verde, en tonos hondos)
  viven solo en la rueda, los asientos y el logo. El resto es tinta sobre blanco. Archivo ancha en todo.
- **FIRST VIEWPORT.** "La tanda de siempre. Nadie se va con la plata." en blanco y dorado sobre el rojo; a la
  derecha, la rueda pintada directo sobre el rojo, como un emblema.
- **Gesto propio:** la rueda gira una ronda a la vez (900 ms) y cada segmento se pinta, con su filete dorado, cuando
  esa persona paga.

### B · Montaña: finanzas con carácter

- **THESIS.** La calma y la precisión de una app de banco, con una marca que se reconoce: el logo es el sistema.
- **OWN-WORLD.** El verde montaña #0e3b2c es el campo de la marca, con una línea amarilla bajo la barra. El amarillo
  #f2c230 queda solo para lo que importa: el punto del logo, el turno, la bolsa y la acción sobre el verde. Bricolage
  Grotesque en títulos y Geist en texto y números.
- **FIRST VIEWPORT.** "Cuentas claras, tandas largas." (del refrán "cuentas claras, amistades largas"). A la derecha,
  la rueda en un medallón blanco dentro de una órbita amarilla, el logo en grande, que cruza el borde hacia la sección
  de abajo.
- **Gesto propio:** el punto del logo da la vuelta a la rueda (900 ms) y se detiene junto a quien cobra.

**Lo que corrigen las dos:** la barra superior lleva el color de la marca con el logo en blanco, y destaca desde
lejos. El color tiene un trabajo (marca, turno, pagado, alerta) y no se reparte por toda la página.

## Cada página según su función (`web/src/paginas.css`)

`App.tsx` pone `data-pagina` en `.app` con el tipo de ruta; cada página se ajusta a lo que la gente viene a hacer.

| Página | Función | Cómo se nota |
| --- | --- | --- |
| Portada (`#/`) | Convencer y entrar | Campo de marca, promesa en dos renglones, una sola acción, la prueba (contrato público, sin contraseñas, dinero de prueba), la gente de cada tanda en fotos y un cierre con la foto de la marca |
| Tandas (`#/tandas`) | Comparar y elegir | La bolsa en grande, los lugares libres como la rueda en chiquito, la línea de entrada resaltada en las abiertas |
| Tanda (`#/tanda/N`) | Pagar y cobrar | La acción del momento a todo el ancho y más alta; en el celular, el panel va antes de la rueda |
| Crear (`#/crear`) | Llenar un formulario | Título más bajo, campos de 52 px, la vista previa fija al lado mientras se llena |
| Demo (`#/demo`) | Proyectar ante el jurado | Escenario oscuro en las dos opciones, con un brillo del color de la marca, letra grande y la rueda al centro |
| Historial y perfil | Leer | Una columna de 44 rem, más interlineado, el nivel como un sello |
| Estado (`#/estado`) | Diagnosticar | Filas compactas y los datos técnicos en letra de ancho fijo |

## Fotos (`web/src/landing/Gente.tsx`)

Cinco fotos ilustrativas hechas con la IA de imágenes de Figma (modelo `gemini-3.1-flash-image`). Son personas que no
existen, en escenas de Costa Rica; el pie de la portada lo dice ("Fotos ilustrativas hechas con IA"). Viven en
`web/src/assets/fotos/` en WebP (de 34 a 92 KB, unos 300 KB en total) y cargan solo al bajar (`loading="lazy"`,
con ancho y alto fijos para que nada salte).

| Foto | Dónde | Opción |
| --- | --- | --- |
| `familia.webp`: abuela y nieta con un celular en la cocina | "La de la familia" | Las dos |
| `oficina.webp`: compañeros almorzando en una soda | "La de la oficina" | Las dos |
| `barrio.webp`: vecinos en el corredor de una casa | "La del barrio" | Las dos |
| `artesano.webp`: un artesano pinta una rueda de carreta | Cierre | A · Sarchí |
| `finca.webp`: una joven en un cafetal con montañas | Cierre | B · Montaña |

Cada foto va en un círculo con su órbita (`FotoOrbita`): en Sarchí, un arco grueso de un color de la carreta; en
Montaña, una línea fina con el punto amarillo del logo en la punta. Para cambiar una foto basta con reemplazar el
archivo (cuadrado, 640 px, u 880 px en el cierre).

## Herramientas usadas

- **Taste:** diales (variedad 6, movimiento 5, densidad 4), promesa de dos renglones, subtítulo de 20 palabras, una
  etiqueta por intención ("Abrir la app"), botón visible sin bajar en el celular, cero rayas largas, modo oscuro.
- **Impeccable** (nueva identidad, piso de calidad y revisión): con la dirección fijada por la persona no hace falta
  sortear alternativas. De Impeccable salen el color comprometido como campo de marca, letras fuera de su lista de
  defectos (por eso se dejó Outfit) y entradas que parten visibles.
- **UI/UX Pro Max:** de su patrón de confianza salió la franja de "prueba" debajo de la portada, con hechos que se
  pueden comprobar. Sus paletas sugeridas (azul con naranja, ámbar con morado) eran genéricas y se descartaron.
- **DESIGN.md de Google + awesome-design-md:** `docs/disenos/sarchi.md` y `montana.md`, lint sin avisos. La
  referencia de Mastercard dio la regla de color de Sarchí: los colores de la marca solo en la marca.
- **Stop Slop:** frases de la portada directas y con la voz de cada opción.
- **Emil Kowalski:** curvas, tiempos y el plan de movimiento (abajo): cada animación responde para qué existe y
  cuántas veces se ve. **Addy Osmani:** tramos verificados y revisión del propio diff.
- **Figma MCP:** las cinco fotos, generadas con su IA de imágenes y bajadas cuando la persona abrió `www.figma.com`
  en la red del entorno. En el archivo de Figma, la página "Dos opciones" tiene una lámina por opción (portada con la
  rueda como vector, colores como variables `Rounda / Sarchí` y `Rounda / Montaña`, letra, gente, cierre y
  movimiento), con las fotos subidas en sus círculos.
- **Context7** (fuentes de Fontsource), **Playwright** (capturas y pruebas de navegador) y el protocolo de **Chrome
  DevTools** (CLS y LCP de la portada).
- **Understand-Anything (Egonex-AI):** registrado en `.claude/settings.json`; solo carga en sesiones que arrancan
  desde `main`.

## Reglas de movimiento (Emil Kowalski)

1. Cada animación tiene un porqué: entrar sin saltos, confirmar una acción o mostrar un cambio de estado.
2. `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) para entrar o responder; `--ease-in-out` para moverse en
   pantalla (el giro de la rueda, el punto que da la vuelta). Nunca `ease-in`.
3. Apretar 140 ms, hover y avisos 200 ms, páginas 280 ms. Solo celebrar (pagar, cobrar) o girar la rueda dura más.
4. Solo `transform` y `opacity` en HTML. En SVG, `transform` recalcula el diseño en cada cuadro: nada infinito ahí.
5. Nada aparece desde `scale(0)` ni desde opacidad 0 en la primera vista de la portada (la promesa entra ya visible
   y solo sube 18 px). Hover solo con mouse. Con "reducir movimiento" nada se esconde y quedan los fundidos.
6. Cada gesto pasa una sola vez y es de la marca. Lo único que sigue moviéndose es la rueda de ejemplo.

| Dónde | Sarchí | Montaña | Para qué |
| --- | --- | --- | --- |
| Portada, al cargar | El fleco dorado se desenrolla (1.1 s) | La órbita amarilla se dibuja alrededor del medallón (1.6 s) | Presentar la marca |
| Fotos, al bajar | El círculo se abre, la foto se asienta y el arco de color se pinta | Igual, con el punto del logo en la punta de la órbita | Presentar a la gente sin saltos |
| Pasos, al bajar | El número se asienta y el riel se traza hacia el siguiente | Igual | Mostrar que es una secuencia |
| Gráfica de garantías | Las barras crecen | Igual | Explicar que cobrar primero cuesta más |
| App, al entrar | El fleco de la barra se desenrolla | La línea amarilla se traza | La marca, una vez (la barra no se vuelve a dibujar al cambiar de página) |
| Lista de tandas | Los lugares ocupados se llenan uno tras otro (35 ms entre uno y otro) | Igual | Ver cuánto falta para arrancar |

## Piso de calidad (Impeccable)

Sin etiquetas sobre los títulos, sin texto con degradado, sin bordes de color a un lado, sin sombras duras, sin
caracteres como íconos (la marca de "ya cobró" es un trazo SVG), fuentes servidas desde el propio sitio (pedidas antes
de dibujar, con un tope de 400 ms), contraste AA en textos en claro y oscuro, y detalles del navegador (cursor de
texto, barras de desplazamiento, color de los controles) con los colores de la marca.

Mediciones de la portada con fotos y animaciones, con el protocolo de Chrome DevTools (vía Playwright), a 1440 px y
a 390 px: CLS 0.000 en las dos opciones; LCP de 500 a 556 ms en Sarchí y de 452 a 520 ms en Montaña.
