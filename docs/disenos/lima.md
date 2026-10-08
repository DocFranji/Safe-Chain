---
version: alpha
name: Rounda Lima
description: Diseño en prueba "lima" de Rounda (tandas con contrato inteligente en Stellar). Fintech amable, claro u oscuro según el teléfono, con un verde lima para actuar, un círculo central oscuro donde está la bolsa y el punto del logo que señala a quien cobra.
colors:
  primary: "#b0e65c"
  on-primary: "#141712"
  primary-border: "#3b6a14"
  primary-text: "#3b6a14"
  primary-soft: "#e6f5d3"
  neutral: "#f0f2ec"
  surface: "#fbfcf9"
  surface-soft: "#e5e9df"
  on-surface: "#141712"
  on-surface-muted: "#4b5247"
  line: "#d8ddd2"
  field-border: "#858d80"
  hub: "#141712"
  on-hub: "#f0f2ec"
  turn: "#f2a71b"
  turn-soft: "#fdf0d2"
  on-turn: "#141712"
  paid-text: "#2f6410"
  error: "#c8352b"
  error-soft: "#fbe3df"
  error-text: "#9a2219"
  dark-neutral: "#0f120e"
  dark-surface: "#171b15"
  dark-surface-soft: "#20251d"
  dark-on-surface: "#eef2ea"
  dark-on-surface-muted: "#a9b2a3"
  dark-line: "#2a3027"
  dark-field-border: "#6b7466"
  dark-hub: "#232920"
  dark-primary-text: "#c3ef80"
  dark-error: "#ff7b6b"
typography:
  display:
    fontFamily: Outfit Variable
    fontSize: 64px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Outfit Variable
    fontSize: 40px
    fontWeight: 750
    lineHeight: 1.08
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Outfit Variable
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Outfit Variable
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.2
  number-lg:
    fontFamily: Outfit Variable
    fontSize: 44px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: -0.02em
    fontFeature: '"tnum"'
  body-lg:
    fontFamily: Outfit Variable
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: Outfit Variable
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Outfit Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Outfit Variable
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.2
rounded:
  sm: 14px
  lg: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 72px
  gutter: 20px
  max-app: 1080px
  max-landing: 1200px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 14px 22px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 14px 22px
    height: 48px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  chip-open:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.paid-text}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  chip-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px 14px
  wheel-hub:
    backgroundColor: "{colors.hub}"
    textColor: "{colors.on-hub}"
    typography: "{typography.number-lg}"
    rounded: "{rounded.full}"
    size: 160px
  wheel-segment-paid:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  wheel-segment-pending:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  wheel-segment-paid-border:
    backgroundColor: "{colors.primary-border}"
  wheel-turn-marker:
    backgroundColor: "{colors.turn}"
    textColor: "{colors.on-turn}"
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
  text-muted:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface-muted}"
  link:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary-text}"
  chip-turn:
    backgroundColor: "{colors.turn-soft}"
    textColor: "{colors.on-turn}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  filter:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.full}"
    padding: 6px 14px
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  text-input-border:
    backgroundColor: "{colors.field-border}"
    height: 1px
  page-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  filter-dark:
    backgroundColor: "{colors.dark-surface-soft}"
    textColor: "{colors.dark-on-surface-muted}"
    rounded: "{rounded.full}"
  divider-dark:
    backgroundColor: "{colors.dark-line}"
    height: 1px
  text-input-border-dark:
    backgroundColor: "{colors.dark-field-border}"
    height: 1px
  wheel-hub-dark:
    backgroundColor: "{colors.dark-hub}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: 160px
  link-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-primary-text}"
  error-text-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-error}"
---

# Rounda: Lima

## Overview

Rounda es la tanda de siempre (todos ponen la misma cuota y, por turnos, uno cobra la bolsa) con las reglas en un
contrato de Stellar. La ven dos públicos a la vez: el jurado del hackathon, en video y en computadora, y la gente que
entra desde el teléfono con su grupo. Por eso el sistema es claro antes que llamativo: fondo verde salvia muy pálido,
tinta casi negra, un solo verde lima para actuar y nada de jerga cripto.

La pieza que da identidad es **la rueda**: un círculo central oscuro con la bolsa, y alrededor un segmento por
persona que se llena de verde cuando esa persona paga. La rueda no gira: el punto del logo (el aro con un punto que da
vueltas) recorre el círculo por fuera y se detiene junto a quien cobra. El logo y la rueda son la misma idea.

Modo de rediseño: renovación completa del lenguaje visual sobre el mismo contenido, las mismas rutas
(`#/tandas`, `#/tanda/N`, `#/crear`, `#/demo`, `#/historial`, `#/estado`) y los mismos textos que revisan las pruebas.
Diales (skill Taste): variedad 6, movimiento 5, densidad 4 en la portada y 5 en la app. Es uno de tres mundos
nuevos en prueba (los otros: `docs/disenos/cusuco.md` y `docs/disenos/ronda.md`); se ve con `?tema=lima`.

Referencias usadas: la skill Taste (reglas de portada y de estilo), UI/UX Pro Max (patrón "Minimal & Direct + Demo"
del tipo "Expense Splitter": verde de saldo, rojo de deuda y un color por estado), la referencia de Wise de
awesome-design-md (un solo acento verde para actuar, tarjetas muy redondeadas, títulos pesados) y Stop Slop para los
textos.

## Colors

Una paleta de neutros verde salvia con un acento y tres colores de estado. El acento es el mismo en toda la web.

- **Lima Rounda (#b0e65c):** el único acento. Botón principal, segmentos pagados de la rueda y la cifra de la bolsa.
  Siempre con texto en tinta (#141712, 12.3:1). Sobre el fondo claro lleva un borde verde oscuro (#3b6a14) porque
  la lima sola no se distingue del fondo (1.3:1).
- **Verde texto (#3b6a14):** enlaces y textos en verde sobre el fondo claro (5.7:1). En oscuro, #c3ef80.
- **Salvia (#f0f2ec):** el fondo de toda la página. Las tarjetas van en #fbfcf9 y los rellenos suaves en #e5e9df.
- **Tinta (#141712) y tinta suave (#4b5247):** textos principal y secundario (16:1 y 7.2:1 sobre el fondo).
- **Ámbar turno (#f2a71b):** "le toca": quién cobra, lo elegido, el día de cobro. Siempre con texto en tinta.
- **Rojo alerta (#c8352b):** vencido, mora, error (5.1:1 sobre blanco). Fondo suave #fbe3df con texto #9a2219.
- **Cubo (#141712):** el círculo central de la rueda, oscuro en el modo claro; en el modo oscuro sube a #232920 para
  despegarse del fondo.

El modo oscuro sigue `prefers-color-scheme`: fondo #0f120e, tarjetas #171b15, texto #eef2ea y #a9b2a3. La lima no
cambia. No hay secciones con el tema invertido: cada página es clara u oscura de arriba abajo.

## Typography

Una sola familia servida desde el propio sitio (`@fontsource`): **Outfit**. Es geométrica y redonda como el logo.
Títulos y cifras grandes pesados (700 a 800) y con el espaciado un poco cerrado; el texto en 400 a 17 px.

Se probó Atkinson Hyperlegible Next para el texto, pero su cero lleva una raya y en una app de dinero "1 000 TUSD" se
leía "1 ØØØ"; ningún rasgo de la fuente la quita.

El título de la portada ocupa dos renglones como máximo en computadora, y el texto de debajo no pasa de 20 palabras.
Las cifras de dinero usan números de ancho fijo (`tabular-nums`). No se usan mayúsculas sostenidas para adornar.

## Layout

La app mide hasta 1080 px y la portada hasta 1200 px, con márgenes de 20 px en el teléfono. Escala de espacios de
4, 8, 16, 24, 40 y 72 px. En el teléfono todo pasa a una columna, sin desplazamiento horizontal (el menú de la app
se desliza de lado).

La portada usa cuatro composiciones distintas, una por sección: portada partida (texto a la izquierda, la rueda de
ejemplo a la derecha), un riel de cuatro pasos, una cuadrícula asimétrica de seguridad con la gráfica de garantías,
y un cierre centrado con una sola acción.

## Elevation & Depth

Plano. La profundidad sale de capas de tono: el fondo salvia, las tarjetas casi blancas encima y una línea de 1 px
(#d8ddd2). No hay sombras en tarjetas ni botones; solo los menús que flotan llevan una sombra suave teñida de verde.
El único elemento oscuro sobre fondo claro es el cubo de la rueda, para que la bolsa sea lo primero que se ve.

## Shapes

Regla única: los botones, etiquetas y filtros son píldoras (radio completo); las tarjetas y paneles, 24 px; los
campos de formulario y las piezas chicas dentro de una tarjeta, 14 px. Los segmentos de la rueda tienen las esquinas
redondeadas por el trazo.

## Components

- **Botón principal:** píldora lima, texto en tinta, 48 px de alto. Al apretar cede a `scale(0.97)` en 140 ms.
  Un solo botón principal por pantalla.
- **Botón secundario:** píldora casi blanca con línea de 1 px; en oscuro, la tarjeta oscura con línea.
- **Tarjeta de tanda:** radio 24 px, línea de 1 px, los asientos como puntos que se llenan de lima.
- **Etiquetas de estado:** "Abierta" en lima suave con texto verde; "En curso" en relleno neutro; "Cancelada" en
  rojo suave.
- **La rueda:** un segmento por persona. Pendiente: casi blanco con línea. Pagó: lima con borde verde. En mora:
  rojo suave con línea punteada. Lugar libre: solo la línea punteada. El segmento de quien cobra lleva contorno de tinta
  y, por fuera, el punto del logo (lima con aro de tinta) se detiene a su lado; al pasar de ronda, el punto avanza
  (900 ms, ease-in-out). El cubo oscuro muestra la bolsa en lima y, alrededor, un aro con el tiempo que le queda a la ronda.
- **Barra de la app:** sobre el fondo, con el logo, el menú en píldoras (la página actual en tinta) y la billetera
  a la derecha; pegada arriba en pantallas anchas.
- **Historia de la tanda:** línea de tiempo con un punto por evento, del color de lo que pasó.

Movimiento: `cubic-bezier(0.23, 1, 0.32, 1)` para entrar y responder, `cubic-bezier(0.77, 0, 0.175, 1)` para el giro
de la rueda (900 ms). Apretar 140 ms, hover 200 ms, páginas 280 ms. Solo `transform` y `opacity`; con "reducir
movimiento" quedan los fundidos y la rueda de ejemplo se queda quieta.

## Do's and Don'ts

- Do usar la lima solo para la acción principal, lo pagado y la bolsa.
- Do poner el texto en tinta sobre la lima y el ámbar; nunca blanco.
- Do probar cada pantalla en claro y en oscuro, y a 390 px de ancho.
- Do escribir en español llano: "garantía", "cuota", "bolsa", "turno". Sin "wallet", "on-chain" ni "DeFi".
- Don't usar rayas largas en textos visibles: punto, coma o dos puntos.
- Don't poner etiquetas pequeñas en mayúsculas encima de los títulos, ni puntos de colores de adorno.
- Don't repetir una composición de sección en la portada ni invertir el tema a mitad de página.
- Don't dibujar íconos a mano: solo las marcas de la rueda (punto y visto) son trazos propios.
- Don't animar nada infinito en SVG; el giro del logo es lo único que da vueltas sin parar.
