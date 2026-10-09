---
version: alpha
name: Rounda (tres opciones en prueba)
description: Índice de las opciones de marca en prueba de Rounda. Cada una tiene su DESIGN.md completo en docs/disenos; cuando el equipo elija, ese archivo pasa a ser este.
omitted:
  - section: colors
    reason: "Cada opción define los suyos: docs/disenos/orbita.md, sarchi.md y montana.md."
  - section: typography
    reason: "Por opción, en los mismos archivos."
  - section: rounded
    reason: "Por opción, en los mismos archivos."
  - section: spacing
    reason: "Por opción, en los mismos archivos."
  - section: components
    reason: "Por opción, en los mismos archivos."
---

# Rounda: opciones de marca en prueba

## Overview

**Órbita (C)** es la opción por defecto: la persona no se quedó con Sarchí ni con Montaña y pidió la estética y las
animaciones de las plantillas de Framer (Vallure como base; Arewno, Payer y Cryptor para los círculos), con
movimiento de círculos y giros porque la marca es una ronda. Sarchí y Montaña siguen en la franja "Diseño en prueba"
para comparar. Se cambian ahí o con `?tema=orbita|sarchi|montana` antes del `#` en la URL. Todas tienen modo oscuro
(`?modo=oscuro` o el botón de la franja).

| Opción | Campo de marca | La "cosa" de Rounda | Voz | DESIGN.md |
| --- | --- | --- | --- | --- |
| **C · Órbita** (`?tema=orbita`, por defecto) | Marino con brillo azul eléctrico | La ronda de personas: caras que giran en órbitas y pasan por el logo; la rueda en un celular | "La tanda de siempre. Nadie se va con la plata." | `docs/disenos/orbita.md` |
| **A · Sarchí** (`?tema=sarchi`) | Rojo carreta con fleco dorado | La rueda pintada de la carreta, que gira; sus colores solo en la rueda y la marca | "La tanda de siempre. Nadie se va con la plata." | `docs/disenos/sarchi.md` |
| **B · Montaña** (`?tema=montana`) | Verde montaña con línea amarilla | El punto del logo da la vuelta a la rueda y señala a quien cobra | "Cuentas claras, tandas largas." | `docs/disenos/montana.md` |

En todas: el nombre **Rounda** y su logo (un aro con un punto que da vueltas) en blanco sobre la barra de color, la
rueda con un círculo central donde está la bolsa, fotos de gente en círculo con una órbita alrededor (hechas con IA
y avisadas en el pie), español llano sin jerga cripto, y cada página vestida según su función (`docs/diseno.md`).

## Do's and Don'ts

- Do elegir una opción y copiar su archivo de `docs/disenos/` a este DESIGN.md; después, borrar la otra (pasos en
  `docs/diseno.md`).
- Do pasar `npx @google/design.md lint` sobre cada DESIGN.md antes de subirlo.
- Don't mezclar piezas de distintas opciones en una misma pantalla.
