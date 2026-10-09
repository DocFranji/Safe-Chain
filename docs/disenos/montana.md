---
version: alpha
name: Rounda Montaña
description: Opción B de Rounda. Finanzas con carácter. Verde montaña como campo de la marca, un amarillo solo para lo que importa y el punto del logo que da la vuelta a la rueda y señala a quien cobra. Voz de refrán tico ("cuentas claras, tandas largas").
colors:
  primary: "#0e3b2c"
  on-primary: "#fefefd"
  accent: "#146c4e"
  on-accent: "#fefefd"
  detail: "#f2c230"
  on-detail: "#0f1a16"
  neutral: "#f4f6f4"
  surface: "#fefefd"
  surface-soft: "#e9eeeb"
  on-surface: "#0f1a16"
  on-surface-muted: "#4a5752"
  line: "#dfe5e1"
  field-border: "#83908a"
  turn-soft: "#fdf3cf"
  paid-soft: "#e1f0e8"
  paid-text: "#0f5a40"
  hub-note: "#b7cec3"
  error: "#c4320a"
  error-soft: "#fde9e1"
  error-text: "#9c2706"
  dark-neutral: "#0b1310"
  dark-surface: "#121d18"
  dark-on-surface: "#eef3f0"
  dark-on-surface-muted: "#a2b1aa"
  dark-primary: "#0b2a20"
  dark-accent: "#4fc28f"
  dark-on-accent: "#0b1310"
typography:
  display:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 70px
    fontWeight: 750
    lineHeight: 0.98
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 54px
    fontWeight: 750
    lineHeight: 1.04
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 23px
    fontWeight: 750
    lineHeight: 1.15
  number-lg:
    fontFamily: Geist Variable
    fontSize: 42px
    fontWeight: 650
    lineHeight: 1
    letterSpacing: -0.03em
    fontFeature: '"tnum"'
  body-md:
    fontFamily: Geist Variable
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Geist Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Geist Variable
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.2
rounded:
  md: 12px
  lg: 18px
  xl: 28px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 88px
  header-line: 3px
components:
  header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
  header-line:
    backgroundColor: "{colors.detail}"
    height: 3px
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 12px 22px
    height: 48px
  button-primary-on-brand:
    backgroundColor: "{colors.detail}"
    textColor: "{colors.on-detail}"
    rounded: "{rounded.full}"
    height: 48px
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-muted:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.lg}"
  chip-open:
    backgroundColor: "{colors.turn-soft}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: 3px 12px
  chip-running:
    backgroundColor: "{colors.paid-soft}"
    textColor: "{colors.paid-text}"
    rounded: "{rounded.full}"
  chip-cancelled:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.full}"
  error-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  text-input-border:
    backgroundColor: "{colors.field-border}"
    height: 1px
  wheel-hub:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.detail}"
    typography: "{typography.number-lg}"
    rounded: "{rounded.full}"
    size: 164px
  wheel-hub-note:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.hub-note}"
  wheel-segment-paid:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  wheel-dot:
    backgroundColor: "{colors.detail}"
    textColor: "{colors.on-detail}"
    rounded: "{rounded.full}"
    size: 20px
  medallion:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.full}"
  page-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface-muted}"
    rounded: "{rounded.lg}"
  header-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.on-primary}"
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-on-accent}"
    rounded: "{rounded.full}"
  photo:
    backgroundColor: "{colors.surface-soft}"
    rounded: "{rounded.full}"
    size: 300px
  photo-orbit:
    backgroundColor: "{colors.accent}"
    height: 1px
  photo-orbit-dot:
    backgroundColor: "{colors.detail}"
    rounded: "{rounded.full}"
    size: 10px
---

# Rounda: Montaña (opción B)

## Overview

Finanzas con carácter. Toma de Fintech la calma, el orden y la precisión de una app de banco; de la carreta toma la
rueda y el orgullo local. La personalidad viene de tres decisiones de marca:

- **Un campo de marca verde montaña** (#0e3b2c) en la barra y la portada, con el logo en blanco y su punto en
  amarillo. La barra lleva una línea amarilla de 3 px debajo: el logo se ve desde lejos.
- **El logo es el sistema.** El aro con un punto que da vueltas se vuelve la rueda: el punto amarillo la recorre y
  se detiene junto a quien cobra. En la portada, la rueda va en un medallón blanco dentro de una órbita amarilla, el
  logo en grande, que cruza el borde entre el verde y el blanco.
- **La voz del refrán:** "Cuentas claras, tandas largas.", a partir de "cuentas claras, amistades largas".

Diales (skill Taste): variedad 6, movimiento 5, densidad 4.

## Colors

- **Verde montaña (#0e3b2c):** campo de la marca y cubo de la rueda. Texto blanco encima (12.4:1).
- **Verde de acción (#146c4e):** botón principal en la app y segmentos pagados. Texto blanco (6.3:1).
- **Amarillo (#f2c230):** solo para lo que importa: el punto del logo, a quién le toca, la cifra de la bolsa, el
  tiempo de la ronda y la acción principal sobre el verde. Siempre con texto en tinta (10.6:1).
- **Fondo y piezas:** #f4f6f4 y #fefefd, línea #dfe5e1, texto suave #4a5752 (7:1).
- **Rojo óxido (#c4320a):** vencido, mora, error.

En oscuro: fondo #0b1310, piezas #121d18, texto #eef3f0; la acción sube a #4fc28f con texto oscuro. La demo usa
siempre este oscuro, porque se proyecta.

## Typography

**Bricolage Grotesque** en títulos (750, espaciado cerrado): una grotesca con carácter, cálida, sin caer en una letra
de juguete. **Geist** en texto y números (de ancho fijo), con la precisión de una app de finanzas. Las dos se sirven
desde el sitio.

## Layout

Portada partida en verde: la promesa en dos renglones a la izquierda y el medallón a la derecha, cruzando hacia la
sección blanca. Debajo, tres hechos que se pueden comprobar, la gente (tres fotos en círculo: la tanda de la familia,
la oficina y el barrio), los pasos en un riel (el primero en amarillo), la seguridad (la gráfica de garantías y tres
reglas; la primera en verde de marca) y un cierre verde con la acción en amarillo y la foto de una joven en un
cafetal. Cada página de la app se viste según su función (`web/src/paginas.css`).

## Elevation & Depth

Piezas blancas con una sombra fina de dos capas y línea de 1 px; el medallón lleva una sombra larga y suave. El
contraste entre el campo verde y el blanco hace el resto.

## Shapes

Botones, etiquetas y filtros en píldora; piezas de 18 px; campos de 12 px; el medallón y la órbita, círculos.

## Components

- **Barra:** verde, con el logo y el menú en blanco, la página actual en una pastilla blanca con texto verde y una
  línea amarilla debajo.
- **Rueda:** `RuedaMontana.tsx`. Segmentos que se pintan de verde al pagar; quien cobra lleva contorno amarillo y el
  punto del logo a su lado; el cubo verde muestra la bolsa en amarillo y el tiempo de la ronda en un aro amarillo.
  La rueda no gira: el punto avanza (900 ms, ease-in-out).
- **Etiquetas:** "Abierta" en amarillo suave, "En curso" en verde suave, "Cancelada" en rojo suave.
- **Fotos:** en círculo, dentro de una órbita fina verde con el punto amarillo en la punta (el logo otra vez); en el
  cierre, la órbita es blanca. Al entrar en pantalla, el círculo se abre y el punto recorre la órbita mientras se
  dibuja. Son ilustrativas, hechas con IA.
- **Movimiento de marca:** la órbita del medallón se dibuja al cargar la portada; la línea amarilla de la barra se
  traza al abrir la app.

## Do's and Don'ts

- Do usar el amarillo solo para el punto, el turno, la bolsa y la acción sobre el verde.
- Do mantener el texto en tinta sobre el amarillo.
- Do usar Geist para los números y Bricolage para los títulos.
- Don't usar el amarillo como fondo de secciones.
- Don't agregar un segundo punto o adorno que compita con el punto del logo.
- Don't usar rayas largas en textos visibles.
