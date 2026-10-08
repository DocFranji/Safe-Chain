---
version: alpha
name: Rounda (dos opciones en prueba)
description: Índice de las dos opciones de marca en prueba de Rounda. Cada una tiene su DESIGN.md completo en docs/disenos; cuando el equipo elija, ese archivo pasa a ser este.
omitted:
  - section: colors
    reason: "Cada opción define los suyos: docs/disenos/sarchi.md y docs/disenos/montana.md."
  - section: typography
    reason: "Por opción, en los mismos archivos."
  - section: rounded
    reason: "Por opción, en los mismos archivos."
  - section: spacing
    reason: "Por opción, en los mismos archivos."
  - section: components
    reason: "Por opción, en los mismos archivos."
---

# Rounda: dos opciones de marca en prueba

## Overview

Las dos opciones combinan la identidad de la carreta de Sarchí con la seriedad de una app de finanzas. Corrigen lo
que la persona vio en las versiones Carreta (demasiado colorida, poco seria) y Fintech (sin personalidad de marca y
con la barra del mismo color del fondo, que apagaba el logo). Se cambian con la franja "Diseño en prueba" de arriba o
con `?tema=sarchi|montana` antes del `#` en la URL. Las dos tienen modo oscuro (`?modo=oscuro` o el botón de la
franja).

| Opción | Campo de marca | La "cosa" de Rounda | Voz | DESIGN.md |
| --- | --- | --- | --- | --- |
| **A · Sarchí** (`?tema=sarchi`, por defecto) | Rojo carreta con fleco dorado | La rueda pintada de la carreta, que gira; sus colores solo en la rueda y la marca | "La tanda de siempre. Nadie se va con la plata." | `docs/disenos/sarchi.md` |
| **B · Montaña** (`?tema=montana`) | Verde montaña con línea amarilla | El punto del logo da la vuelta a la rueda y señala a quien cobra | "Cuentas claras, tandas largas." | `docs/disenos/montana.md` |

En las dos: el nombre **Rounda** y su logo (un aro con un punto que da vueltas) en blanco sobre la barra de color, la
rueda con un círculo central donde está la bolsa, español llano sin jerga cripto, y cada página vestida según su
función (`docs/diseno.md`).

## Do's and Don'ts

- Do elegir una opción y copiar su archivo de `docs/disenos/` a este DESIGN.md; después, borrar la otra (pasos en
  `docs/diseno.md`).
- Do pasar `npx @google/design.md lint` sobre cada DESIGN.md antes de subirlo.
- Don't mezclar piezas de las dos opciones en una misma pantalla.
