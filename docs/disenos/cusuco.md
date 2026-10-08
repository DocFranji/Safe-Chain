---
version: alpha
name: Rounda Cusuco
description: Diseño en prueba "cusuco" de Rounda. La mascota es un cusuco (armadillo de nueve bandas) que se enrolla como una bola para protegerse; la rueda de la tanda es su caparazón y la bolsa una moneda. Cielo pálido, turquesa para actuar, contornos de tinta como un juguete.
colors:
  primary: "#22b3a6"
  on-primary: "#1b2433"
  primary-text: "#0d6e66"
  neutral: "#e8f0f7"
  surface: "#fafcfe"
  surface-soft: "#d7e4ef"
  on-surface: "#1b2433"
  on-surface-muted: "#475467"
  line: "#cbd8e4"
  field-border: "#7a8899"
  turn: "#f6c445"
  turn-soft: "#fdf0c9"
  on-turn: "#1b2433"
  paid-soft: "#d5f1ed"
  paid-text: "#0b5f58"
  error: "#d1393b"
  error-soft: "#fbe1df"
  error-text: "#9b1f22"
  mascot-body: "#e7bf8e"
  mascot-belly: "#f6dfbf"
  mascot-shell: "#b4582f"
  mascot-band: "#8a4224"
  mascot-cheek: "#f09a84"
  mascot-ink: "#1b2433"
  dark-neutral: "#0e1622"
  dark-surface: "#162131"
  dark-on-surface: "#e9f0f7"
  dark-on-surface-muted: "#a3b1c2"
  dark-primary: "#2cc0b2"
  dark-primary-text: "#6fe0d4"
typography:
  display:
    fontFamily: Nunito Variable
    fontSize: 56px
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Nunito Variable
    fontSize: 42px
    fontWeight: 900
    lineHeight: 1.05
  headline-md:
    fontFamily: Nunito Variable
    fontSize: 24px
    fontWeight: 900
    lineHeight: 1.15
  number-lg:
    fontFamily: Nunito Variable
    fontSize: 40px
    fontWeight: 900
    lineHeight: 1
    fontFeature: '"tnum"'
  body-md:
    fontFamily: Nunito Variable
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.5
  body-sm:
    fontFamily: Nunito Variable
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.45
  label-md:
    fontFamily: Nunito Variable
    fontSize: 16px
    fontWeight: 800
    lineHeight: 1.2
rounded:
  sm: 12px
  md: 16px
  lg: 28px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 88px
  outline: 2px
  button-edge: 4px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px 22px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px 22px
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
    backgroundColor: "{colors.turn}"
    textColor: "{colors.on-turn}"
    rounded: "{rounded.full}"
    padding: 2px 10px
  chip-turn-soft:
    backgroundColor: "{colors.turn-soft}"
    textColor: "{colors.on-turn}"
    rounded: "{rounded.full}"
  chip-paid:
    backgroundColor: "{colors.paid-soft}"
    textColor: "{colors.paid-text}"
    rounded: "{rounded.full}"
  chip-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.full}"
  error-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
  link:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary-text}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 12px 14px
  text-input-border:
    backgroundColor: "{colors.field-border}"
    height: 2px
  wheel-coin:
    backgroundColor: "{colors.turn}"
    textColor: "{colors.on-turn}"
    typography: "{typography.number-lg}"
    rounded: "{rounded.full}"
    size: 160px
  wheel-plate-paid:
    backgroundColor: "{colors.mascot-shell}"
    textColor: "{colors.surface}"
  wheel-plate-band:
    backgroundColor: "{colors.mascot-band}"
  mascot:
    backgroundColor: "{colors.mascot-body}"
    textColor: "{colors.mascot-ink}"
  mascot-belly:
    backgroundColor: "{colors.mascot-belly}"
  mascot-cheek:
    backgroundColor: "{colors.mascot-cheek}"
  page-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface-muted}"
    rounded: "{rounded.lg}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.mascot-ink}"
    rounded: "{rounded.md}"
  link-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-primary-text}"
---

# Rounda: Cusuco

## Overview

Una tanda funciona si nadie se va con la plata. El cusuco (así se le dice al armadillo en Costa Rica) hace eso con su
cuerpo: cuando hay peligro se enrolla y queda hecho una bola. Es redondo como el nombre **Rounda** y protector como la
garantía. Por eso es la mascota de este mundo y está en las piezas que importan:

- **La rueda es el caparazón.** Cada persona es una placa; la placa se pinta de terracota cuando esa persona paga. Con
  todos al día, el caparazón queda completo.
- **La bolsa es una moneda** amarilla en el centro, con el tiempo de la ronda alrededor.
- **La cabeza del cusuco** asoma arriba de la rueda y señala a quien cobra; la rueda gira una ronda a la vez.
- **En la portada** el cusuco llega rodando hecho bola, se desenrolla y saluda. Mientras algo carga en la app, rueda.

El tono es de juguete bien hecho (contornos de tinta de 2 px, esquinas muy redondas, botones que se hunden) para que
cualquiera, de cualquier edad, se sienta invitado. Se ve con `?tema=cusuco`; tiene modo oscuro.

Diales (skill Taste): variedad 7, movimiento 6, densidad 4. Patrón de UI/UX Pro Max: "Minimal & Direct + Demo" con
la mascota como guía (estilo de Duolingo o Mailchimp, sin copiarlos).

## Colors

- **Turquesa (#22b3a6):** el único acento para actuar (botón principal, filtros activos, el tiempo de la ronda). Texto
  en tinta encima (6:1). En texto sobre el fondo, el verde azulado oscuro #0d6e66 (5.3:1).
- **Cielo (#e8f0f7):** el fondo. Tarjetas casi blancas (#fafcfe) y rellenos suaves en #d7e4ef.
- **Tinta (#1b2433):** texto y contornos, el mismo trazo que la mascota (13.5:1 sobre el fondo).
- **Amarillo sol (#f6c445):** la moneda de la bolsa, "le toca" y lo elegido. Siempre con texto en tinta (9.6:1).
- **Terracota (#b4582f) y su banda (#8a4224):** solo la mascota y lo pagado en la rueda; nunca un estado de error,
  para no confundirse con el rojo. Los números van en blanco sobre la terracota (4.7:1).
- **Rojo (#d1393b):** vencido, mora, error.

En oscuro, el fondo es azul noche (#0e1622), las tarjetas #162131 y la turquesa sube a #2cc0b2. La mascota no cambia.

## Typography

**Nunito** en todo, servida desde el sitio. Sus terminales redondas siguen la forma de la mascota y del logo. Títulos y
cifras en 900; el texto en 500 a 17 px; botones y etiquetas en 800. Los ceros de Nunito no llevan raya, así que los
montos se leen limpios.

## Layout

Mismo esqueleto que los otros mundos nuevos: portada partida (promesa a la izquierda, la rueda y la mascota a la
derecha), riel de cuatro pasos unido por una línea punteada terracota (el camino del cusuco), la seguridad en una
cuadrícula de piezas con el cusuco enrollado junto a la gráfica de garantías, y un cierre amarillo con una sola acción.
En el celular, una columna con el botón para entrar antes de la rueda.

## Elevation & Depth

Contornos de tinta en lugar de sombras. La única profundidad es el borde inferior de 4 px de los botones, que
desaparece al apretar (el botón baja 3 px): es un juguete que se hunde, y por eso solo los botones lo llevan.

## Shapes

Tarjetas y paneles de 28 px; botones de 16 px; etiquetas y filtros en píldora; placas del caparazón con las esquinas
redondeadas por el trazo. Los asientos de cada tarjeta de tanda son placas chiquitas (6 px de radio).

## Components

- **Botón principal:** turquesa con contorno de tinta y borde inferior de 4 px; al apretar baja 3 px en 140 ms.
- **Etiquetas:** píldoras con contorno; "Abierta" en amarillo sol, "En curso" en turquesa, "Cancelada" en rojo suave.
- **Tarjeta de tanda:** contorno de 2 px; los lugares ocupados son placas terracota.
- **La rueda:** placas con dos bandas curvas; la de quien cobra sube 8 px bajo la cabeza del cusuco. La moneda lleva
  un canto punteado y el aro turquesa del tiempo.
- **Mascota:** `src/components/Cusuco.tsx`, dibujo geométrico propio con colores en variables. Poses: "saluda" (de
  pie, con una pata arriba), "bola" (enrollado) y la cabeza sola para la rueda.

Movimiento: la llegada del cusuco en la portada (rueda 900 ms, se desenrolla, saluda dos veces) es el único momento
de autor; el resto usa las mismas curvas que la app. Con "reducir movimiento" el cusuco aparece ya de pie.

## Do's and Don'ts

- Do usar la mascota para explicar (proteger, rodar, esperar), no como adorno en cada esquina.
- Do mantener la terracota para la mascota y lo pagado; los errores van en rojo.
- Do poner texto en tinta sobre la turquesa y el amarillo.
- Don't usar el borde inferior de juguete en tarjetas: solo en botones.
- Don't cambiar la mascota por una ilustración generada sin mantener sus colores y su trazo de 4 px.
- Don't usar rayas largas en textos visibles.
