---
version: alpha
name: Rounda Ronda
description: Diseño en prueba "ronda" de Rounda. La tanda como una ronda de personas tomadas de la mano alrededor de la bolsa, en el morado de la guaria morada (la flor nacional de Costa Rica), con la ropa de colores de cada persona.
colors:
  primary: "#7b2d8e"
  on-primary: "#fdfcfd"
  primary-soft: "#f1e2f5"
  primary-text: "#6a2179"
  neutral: "#f7f4f8"
  surface: "#fdfcfd"
  surface-soft: "#ece5ef"
  on-surface: "#221a26"
  on-surface-muted: "#5a4f60"
  line: "#e0d7e4"
  field-border: "#8a7f90"
  turn: "#f6b93b"
  turn-soft: "#fdf0d2"
  on-turn: "#221a26"
  person-1: "#7b2d8e"
  person-2: "#f6b93b"
  person-3: "#3aa39d"
  person-4: "#e2813a"
  error: "#c53030"
  error-soft: "#fbe2e2"
  error-text: "#962020"
  dark-neutral: "#151018"
  dark-surface: "#1f1823"
  dark-on-surface: "#f3eef5"
  dark-on-surface-muted: "#b6a9bc"
  dark-primary: "#d39ae3"
  dark-on-primary: "#151018"
typography:
  display:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 80px
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 46px
    fontWeight: 750
    lineHeight: 1.02
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 25px
    fontWeight: 750
    lineHeight: 1.15
  number-lg:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 42px
    fontWeight: 800
    lineHeight: 1
    fontFeature: '"tnum"'
  body-md:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Bricolage Grotesque Variable
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.2
rounded:
  sm: 12px
  lg: 20px
  xl: 32px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 88px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 12px 22px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    height: 48px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  chip-running:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.full}"
    padding: 3px 12px
  chip-open:
    backgroundColor: "{colors.turn-soft}"
    textColor: "{colors.on-turn}"
    rounded: "{rounded.full}"
  chip-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.full}"
  filter:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface-muted}"
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
  wheel-pot:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.number-lg}"
    rounded: "{rounded.full}"
    size: 156px
  wheel-turn-light:
    backgroundColor: "{colors.turn-soft}"
    textColor: "{colors.on-turn}"
  wheel-person-turn:
    backgroundColor: "{colors.turn}"
    textColor: "{colors.on-turn}"
  shirt-1:
    backgroundColor: "{colors.person-1}"
    textColor: "{colors.on-primary}"
  shirt-2:
    backgroundColor: "{colors.person-2}"
    textColor: "{colors.on-surface}"
  shirt-3:
    backgroundColor: "{colors.person-3}"
    textColor: "{colors.on-surface}"
  shirt-4:
    backgroundColor: "{colors.person-4}"
    textColor: "{colors.on-surface}"
  page-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface-muted}"
    rounded: "{rounded.lg}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    rounded: "{rounded.full}"
---

# Rounda: Ronda

## Overview

"Ronda" es el juego de niños en que todos se toman de la mano y dan vueltas; también es la ronda de la tanda, el turno
que pasa de mano en mano. Suena igual que **Rounda**. Este mundo cuenta la tanda con personas antes que con números:

- **La rueda es una ronda de personas** tomadas de la mano alrededor de la bolsa. Cada una lleva su número de turno en
  la camiseta; la camiseta se pinta de su color cuando paga la ronda.
- **La ronda da vueltas** una ronda a la vez (las personas siguen derechas) y quien cobra queda arriba, con una luz
  color mango detrás.
- **La promesa:** "En esta ronda, todos cobran."

El morado viene de la guaria morada, la flor nacional de Costa Rica: es el color de la marca, no un morado de moda.
La regla de Taste contra el morado por defecto tiene una excepción explícita cuando la marca lo pide; aquí se usa
oscuro y sin degradados. Se ve con `?tema=ronda`; tiene modo oscuro.

Diales (skill Taste): variedad 7, movimiento 5, densidad 4.

## Colors

- **Guaria (#7b2d8e):** el único acento para actuar (botón principal, filtros activos) y la bolsa del centro. Texto
  blanco encima (7.9:1). En oscuro sube a #d39ae3 con texto oscuro.
- **Blanco orquídea (#f7f4f8):** el fondo; las piezas en #fdfcfd sin contorno, separadas solo por el tono.
- **Tinta (#221a26):** texto (15.5:1) y las cabezas y brazos de la ronda.
- **Mango (#f6b93b):** "le toca": la luz detrás de quien cobra, el tiempo de la ronda y lo abierto para unirse.
- **La ropa de la ronda:** guaria, mango, verde azulado (#3aa39d) y naranja (#e2813a), repartidos sin repetir vecinos.
  Son datos (quién es quién), no acentos: no se usan en botones. Sobre la guaria el número va en blanco; sobre los
  otros tres, en tinta (5.5:1 o más).
- **Rojo (#c53030):** vencido, mora, error.

## Typography

**Bricolage Grotesque** en todo, servida desde el sitio: tiene trazos con carácter (cálida y un poco irregular) sin
dejar de leerse a 17 px. Títulos en 750 a 800 con el espaciado cerrado; números de ancho fijo. Se descartó Atkinson
para el texto porque su cero lleva raya.

## Layout

Portada partida con la ronda de ejemplo a la derecha y la promesa en dos renglones; pasos en un riel cuyos números
llevan los colores de la ropa, unidos por una línea de tinta (los brazos); la seguridad en una cuadrícula con una pieza
guaria y otra mango; cierre en guaria suave con una sola acción.

## Elevation & Depth

Plano y cálido: tonos en lugar de contornos y sombras. Las piezas se separan del fondo por el tono y una línea de 1 px
abajo. Solo los menús que flotan llevan una sombra suave teñida de morado.

## Shapes

Tarjetas de 20 px, cierre de 32 px, botones y etiquetas en píldora. Las personas de la ronda: cabeza redonda y camiseta
de esquinas suaves.

## Components

- **Botón principal:** píldora guaria con texto blanco; secundario transparente con línea.
- **Etiquetas:** "En curso" en guaria suave, "Abierta" en mango suave, "Cancelada" en rojo suave.
- **Tarjeta de tanda:** sin contorno; los lugares ocupados con el color de la ropa de cada persona.
- **La rueda:** `src/components/RuedaRonda.tsx`. Los brazos son un círculo de tinta; la bolsa, un círculo guaria con
  el aro mango del tiempo; la marca de "ya cobró" va junto al hombro.

## Do's and Don'ts

- Do contar con personas: nombres reales del grupo, su color y su turno.
- Do usar la guaria solo para actuar y para la bolsa.
- Do mantener el texto blanco sobre la guaria en claro y oscuro sobre la guaria clara del modo oscuro.
- Don't usar degradados morados ni brillos.
- Don't usar los colores de la ropa en botones o avisos.
- Don't usar rayas largas en textos visibles.
