---
version: alpha
name: Rounda Sarchí
description: Opción A de Rounda. La carreta de Sarchí, en serio. El rojo de la carreta es el campo de la marca; sus cuatro colores pintados viven solo en la rueda, el logo y el fleco. La interfaz es tinta sobre blanco, con letra Archivo ancha.
colors:
  primary: "#a31f1a"
  on-primary: "#fefefd"
  accent: "#17181c"
  on-accent: "#fefefd"
  detail: "#e8a400"
  on-detail: "#17181c"
  neutral: "#f6f6f5"
  surface: "#fefefd"
  surface-soft: "#efeeeb"
  on-surface: "#17181c"
  on-surface-muted: "#51535b"
  line: "#e2e2df"
  field-border: "#8a8c93"
  link: "#a31f1a"
  turn-soft: "#fbf0d3"
  paid-soft: "#e3f0e8"
  paid-text: "#1f5636"
  error: "#b42318"
  error-soft: "#fce7e4"
  error-text: "#8f1d14"
  wheel-red: "#a31f1a"
  wheel-gold: "#e0a10d"
  wheel-blue: "#24427a"
  wheel-green: "#2c6e49"
  dark-neutral: "#121214"
  dark-surface: "#1b1b1f"
  dark-on-surface: "#f2f1ee"
  dark-on-surface-muted: "#a8a9b0"
  dark-primary: "#8f1b16"
  dark-link: "#f0675d"
typography:
  display:
    fontFamily: Archivo Variable
    fontSize: 50px
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: -0.015em
    fontVariation: '"wdth" 106'
  headline-lg:
    fontFamily: Archivo Variable
    fontSize: 54px
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: -0.01em
    fontVariation: '"wdth" 116'
  headline-md:
    fontFamily: Archivo Variable
    fontSize: 22px
    fontWeight: 800
    lineHeight: 1.15
    fontVariation: '"wdth" 116'
  number-lg:
    fontFamily: Archivo Variable
    fontSize: 36px
    fontWeight: 800
    lineHeight: 1
    fontFeature: '"tnum"'
    fontVariation: '"wdth" 112'
  body-md:
    fontFamily: Archivo Variable
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Archivo Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Archivo Variable
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.2
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 88px
  fringe: 10px
components:
  header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
  fringe:
    backgroundColor: "{colors.detail}"
    height: 10px
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px 20px
    height: 48px
  button-primary-on-brand:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    height: 48px
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
    rounded: "{rounded.sm}"
    padding: 3px 10px
  chip-running:
    backgroundColor: "{colors.paid-soft}"
    textColor: "{colors.paid-text}"
    rounded: "{rounded.sm}"
  chip-cancelled:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.sm}"
  turn-marker:
    backgroundColor: "{colors.detail}"
    textColor: "{colors.on-detail}"
  link:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.link}"
  error-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  text-input-border:
    backgroundColor: "{colors.field-border}"
    height: 1px
  wheel-segment-red:
    backgroundColor: "{colors.wheel-red}"
    textColor: "{colors.on-primary}"
  wheel-segment-gold:
    backgroundColor: "{colors.wheel-gold}"
    textColor: "{colors.on-surface}"
  wheel-segment-blue:
    backgroundColor: "{colors.wheel-blue}"
    textColor: "{colors.on-primary}"
  wheel-segment-green:
    backgroundColor: "{colors.wheel-green}"
    textColor: "{colors.on-primary}"
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
  link-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-link}"
---

# Rounda: Sarchí (opción A)

## Overview

La carreta de Sarchí, en serio. La persona encontró la versión Carreta demasiado colorida y por eso poco seria, y
la versión Fintech sin personalidad de marca y con la barra del mismo color del fondo. Sarchí resuelve las dos cosas
con una regla tomada de la referencia de Mastercard en awesome-design-md: **los colores de la marca viven en la
marca, no en la interfaz**.

- **El campo de la marca es el rojo de la carreta** (#a31f1a): la barra de la app y la portada. El logo va en blanco
  encima, con su punto dorado, y se ve desde lejos.
- **Los cuatro colores pintados de la carreta** (rojo, dorado, cobalto y verde, en tonos hondos) aparecen solo en la
  rueda, en los asientos de cada tanda (que son la rueda en chiquito) y en el logo.
- **El fleco dorado** cuelga de la barra y de la portada: el gesto que hace reconocible a la carreta.
- **La interfaz** es tinta sobre blanco, con líneas finas y esquinas firmes; la acción principal va en tinta.

Voz: "La tanda de siempre. Nadie se va con la plata." Diales (skill Taste): variedad 6, movimiento 5, densidad 4.

## Colors

- **Rojo carreta (#a31f1a):** campo de la marca (barra, portada, cierre) y enlaces. Texto blanco encima (7.5:1).
- **Tinta (#17181c):** texto y acción principal (botones en tinta con texto blanco, 17.6:1).
- **Dorado (#e8a400):** el fleco, el filete de la rueda, el punto del logo y "le toca". Nunca como texto sobre
  blanco (2.1:1); sobre él, texto en tinta (8.2:1).
- **Los colores de la rueda:** rojo #a31f1a, dorado #e0a10d, cobalto #24427a y verde #2c6e49, sin repetir vecinos.
  Los números van en un disco blanco con trazo de tinta.
- **Fondo y piezas:** #f6f6f5 y #fefefd, línea #e2e2df, texto suave #51535b (7:1).
- **Rojo de alerta (#b42318):** vencido, mora, error; siempre con ícono o texto, para no confundirse con la marca.

En oscuro: fondo #121214, piezas #1b1b1f, texto #f2f1ee; la barra baja a #8f1b16 y la rueda se enmarca en oscuro.
La demo usa siempre este oscuro, porque se proyecta.

## Typography

**Archivo** en todo, servida desde el sitio, con su eje de ancho. Los títulos van anchos (116 %) y pesados (800),
como las letras pintadas de los rótulos, pero sin el aire de juguete de una letra de cartel. La promesa usa un ancho
menor (106 %) para caber en dos renglones. El texto va en 400 a 17 px. Los números son de ancho fijo y el cero no
lleva raya.

## Layout

Portada partida: la promesa a la izquierda y la rueda pintada a la derecha, directo sobre el rojo como un emblema;
el fleco dorado la cierra. Debajo, tres hechos que se pueden comprobar, los pasos en un riel con discos de tinta, la
seguridad (la gráfica de garantías y tres reglas) y un cierre rojo con una sola acción. Cada página de la app se
viste según su función (`web/src/paginas.css`).

## Elevation & Depth

Casi plano: líneas de 1 px y una sombra mínima en las piezas. La profundidad la da el campo rojo contra el blanco.

## Shapes

Botones de 10 px, piezas de 14 px, etiquetas como sellos de 6 px. Los segmentos de la rueda tienen el trazo
redondeado de la pintura.

## Components

- **Barra:** roja, con el logo y el menú en blanco; la página actual en una pastilla blanca con texto rojo; el fleco
  dorado debajo.
- **Rueda:** `RuedaSarchi.tsx`. Cada persona es un segmento de su color; se pinta entero al pagar y aparece el filete
  dorado. Gira una ronda a la vez (900 ms, ease-in-out) y quien cobra queda bajo la flecha.
- **Etiquetas:** "Abierta" en dorado suave, "En curso" en verde suave, "Cancelada" en rojo suave.
- **Tarjeta de cobro:** roja con texto blanco.

## Do's and Don'ts

- Do dejar los colores de la carreta en la rueda y en la marca.
- Do usar el rojo como campo (barra, portada, cierre), no como relleno de piezas pequeñas.
- Do mantener la acción principal en tinta dentro de la app.
- Don't pintar secciones enteras de amarillo, azul o verde.
- Don't usar el dorado como texto sobre blanco.
- Don't usar rayas largas en textos visibles.
