---
version: alpha
name: Rounda
description: El diseño de Rounda (Órbita). La estética y el movimiento de las plantillas de Framer que eligió el equipo (Vallure como base; Arewno, Payer y Cryptor para los círculos), adaptados a una tanda. Campo marino con brillo azul eléctrico, piezas blancas con sombras en capas, Geist en peso medio y una ronda de personas que gira.
colors:
  primary: "#070c24"
  on-primary: "#ffffff"
  accent: "#1f4fff"
  on-accent: "#ffffff"
  accent-text: "#1a44e0"
  detail: "#4c7dff"
  turn: "#ffb547"
  on-turn: "#0b0d17"
  neutral: "#f7f8fa"
  surface: "#ffffff"
  surface-soft: "#f0f2f6"
  on-surface: "#0b0d17"
  on-surface-muted: "#5d6170"
  line: "#e5e7ee"
  field-border: "#8e93a3"
  turn-soft: "#fff3dc"
  paid-soft: "#e9eeff"
  paid-text: "#1a3fc4"
  hero-soft: "#a9bdff"
  error: "#d92d20"
  error-soft: "#fdeceb"
  error-text: "#a8231a"
  dark-neutral: "#05070f"
  dark-surface: "#0d1120"
  dark-on-surface: "#eef0f7"
  dark-on-surface-muted: "#9aa1b8"
  dark-accent: "#5b84ff"
  dark-on-accent: "#05070f"
typography:
  display:
    fontFamily: Geist Variable
    fontSize: 82px
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: -0.045em
  headline-lg:
    fontFamily: Geist Variable
    fontSize: 54px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -0.04em
  headline-md:
    fontFamily: Geist Variable
    fontSize: 21px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.03em
  number-lg:
    fontFamily: Geist Variable
    fontSize: 46px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.05em
    fontFeature: '"tnum"'
  body-md:
    fontFamily: Geist Variable
    fontSize: 18px
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
    fontWeight: 500
    lineHeight: 1.2
rounded:
  md: 12px
  lg: 24px
  xl: 32px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 56px
  2xl: 112px
components:
  nav-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 56px
  nav-pill-over-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
  hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display}"
  hero-second-line:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.hero-soft}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 0 24px
    height: 50px
  button-on-brand:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 50px
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  section-alt:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 30px
  card-muted:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.lg}"
  badge:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.full}"
    padding: 6px 12px
  chip-open:
    backgroundColor: "{colors.turn-soft}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
  chip-running:
    backgroundColor: "{colors.paid-soft}"
    textColor: "{colors.paid-text}"
    rounded: "{rounded.full}"
  chip-cancelled:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.full}"
  turn-dot:
    backgroundColor: "{colors.turn}"
    textColor: "{colors.on-turn}"
    rounded: "{rounded.full}"
    size: 20px
  link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-text}"
  error-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  text-input-border:
    backgroundColor: "{colors.field-border}"
    height: 1px
  bar-glow-line:
    backgroundColor: "{colors.detail}"
    height: 1px
  page-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface-muted}"
    rounded: "{rounded.lg}"
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-on-accent}"
    rounded: "{rounded.full}"
---

# Rounda: diseño Órbita

## Overview

Es el diseño definitivo de Rounda, elegido por el equipo entre tres opciones (la historia está en
`docs/diseno.md`). Pidieron el nivel de estética y de animación de las plantillas de Framer, con movimiento de
círculos y giros porque la marca es una ronda. Órbita sale de cuatro referencias, estudiadas en vivo:

- **Vallure** (la base): campo marino con un brillo azul abajo, títulos en peso medio que entran palabra por palabra
  de borroso a nítido, secciones blancas y casi blancas, sombras en capas, un bento con pequeñas animaciones, planes,
  preguntas y un cierre en degradado.
- **Arewno:** la barra en píldora flotante, el celular con un anillo de progreso y los pasos con números grandes en
  tarjetas que se apilan al bajar.
- **Payer:** anillos concéntricos con caras que dan la vuelta, y caras flotando alrededor de un título.
- **Cryptor:** una fila de círculos que pasa por un centro que brilla.

De ahí, la idea propia de Rounda: **la ronda de personas**. Caras reales de nuestras fotos giran en órbitas
alrededor del celular, del título de la gente y del cierre, y pasan una por una por el logo en el haz: a cada una le
toca su turno.

Diales (skill Taste): variedad 7, movimiento 8, densidad 4.

## Colors

- **Marino (#070c24):** campo de la marca (portada, barra de la app, planes destacados, cierre). Texto blanco encima.
- **Azul eléctrico (#1f4fff):** la acción y lo pagado. Texto blanco encima (5.8:1). En el texto de enlaces, #1a44e0.
- **Azul claro (#a9bdff):** el segundo renglón de la promesa sobre el marino.
- **Ámbar (#ffb547):** solo para a quién le toca (el punto de la rueda, el primer turno en las pantallas de ejemplo).
- **Fondo y piezas:** blanco y #f7f8fa, que se alternan por sección; línea #e5e7ee; texto suave #5d6170.
- **Rojo (#d92d20):** vencido, mora, error.

En oscuro: fondo #05070f, piezas #0d1120, texto #eef0f7; la acción sube a #5b84ff con texto oscuro. La portada y el
cierre son marinos en los dos modos. El modo arranca como el del teléfono o la computadora y cada persona lo cambia
con el botón de la barra; queda guardado en su navegador. La demo usa siempre el oscuro.

## Typography

**Geist** en todo, servida desde el sitio. Títulos en peso 500 con el espaciado muy cerrado (-0.045em en la
promesa), como Neue Montreal en Vallure. Texto a 400 y 18 px. Números de ancho fijo.

## Layout

Portada marina centrada: insignia, promesa en dos renglones, subtítulo, dos botones y una escena con el celular de la
app (la rueda de ejemplo en vivo y la lista de quién pagó), tres anillos con caras alrededor y tres avisos flotando.
Debajo, en orden:

1. El haz de caras que pasa por el logo, con una cinta de para qué se hace una tanda.
2. El párrafo de qué es Rounda, que se llena al bajar.
3. Los cuatro pasos apilados, cada uno con su pantalla.
4. El bento de seguridad.
5. La gente: caras en órbita alrededor del título, cuatro cifras y una foto en círculo.
6. Dos ritmos con números de los ejemplos de "Crear".
7. Las preguntas.
8. El cierre.

## Elevation & Depth

Sombras en capas muy suaves: un anillo de 1 px al 4 %, una sombra corta y una larga difusa. El celular y los avisos
llevan un brillo azul. Grano fino sobre los degradados marinos para que no se vean planos.

## Shapes

Píldoras para botones, barra e insignias; piezas de 24 px; campos de 12 px; círculos para fotos, caras, anillos y
el logo.

## Components

- **Barra de la portada:** píldora flotante y fija; oscura sobre la portada y clara (vidrio) sobre el resto.
- **Barra de la app:** marina, con el logo en blanco y una línea azul de 1 px que brilla debajo.
- **Botón de modo (`BotonModo.tsx`):** círculo de 38 px con un anillo fino del color del texto, en las dos barras.
  El ícono es un círculo lleno a medias que gira media vuelta al pasar a oscuro. No aparece en la demo.
- **Rueda:** `RuedaOrbita.tsx`: lo pagado en azul, a quién le toca en ámbar con el punto del logo, el cubo marino.
- **Órbitas (`web/src/landing/piezas.tsx`):** anillos con caras que giran sin ponerse de cabeza; se pausan fuera de
  pantalla.
- **Pantallas de ejemplo:** piezas oscuras dentro de cada paso, con los números de la tanda Quincenal × 6.

## Do's and Don'ts

- Do usar el giro para lo que es una ronda: personas, turnos, la bolsa que pasa.
- Do pausar los bucles fuera de pantalla y apagar el movimiento con "reducir movimiento".
- Do usar números de verdad (presets de "Crear", reglas del contrato) y avisar que las fotos son hechas con IA.
- Don't inventar testimonios ni cifras de uso.
- Don't usar el ámbar para otra cosa que a quién le toca.
- Don't usar rayas largas en textos visibles.
