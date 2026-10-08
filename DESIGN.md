---
version: alpha
name: Rounda (diseños en prueba)
description: Índice de los cinco mundos visuales en prueba de Rounda. Cada mundo nuevo tiene su propio DESIGN.md completo en docs/disenos; cuando el equipo elija uno, ese archivo pasa a ser este.
omitted:
  - section: colors
    reason: "Cada mundo define los suyos: docs/disenos/lima.md, docs/disenos/cusuco.md y docs/disenos/ronda.md (Carreta y Fintech en docs/diseno.md)."
  - section: typography
    reason: "Por mundo, en los mismos archivos."
  - section: rounded
    reason: "Por mundo, en los mismos archivos."
  - section: spacing
    reason: "Por mundo, en los mismos archivos."
  - section: components
    reason: "Por mundo, en los mismos archivos."
---

# Rounda: diseños en prueba

## Overview

Rounda tiene cinco mundos visuales para elegir con la web de verdad. Se cambian con la franja "Diseño en prueba" de
arriba o con `?tema=` antes del `#` en la URL; los tres nuevos tienen modo oscuro (`?modo=oscuro` o el botón de la
franja). Los textos, los flujos y los datos son los mismos en todos: cambia la identidad.

| Mundo | La "cosa" de Rounda | DESIGN.md |
| --- | --- | --- |
| **Lima** (`?tema=lima`) | El punto del logo da la vuelta a la rueda y se detiene en quien cobra. | `docs/disenos/lima.md` |
| **Cusuco** (`?tema=cusuco`) | La mascota: un cusuco que se enrolla como una bola para protegerse. La rueda es su caparazón. | `docs/disenos/cusuco.md` |
| **Ronda** (`?tema=ronda`) | Una ronda de personas tomadas de la mano alrededor de la bolsa, en el morado de la guaria. | `docs/disenos/ronda.md` |
| **Carreta de Sarchí** (`?tema=carreta`, por defecto) | La rueda pintada de la carreta. | `docs/diseno.md` |
| **Fintech** (`?tema=fintech`) | Una app de finanzas sobria. | `docs/diseno.md` |

Lo que no cambia en ningún mundo: el nombre **Rounda** y su logo (un aro con un punto que da vueltas), la rueda con un
círculo central donde está la bolsa, el español llano sin jerga cripto, y las reglas de movimiento de `docs/diseno.md`.

## Do's and Don'ts

- Do elegir un mundo y copiar su archivo de `docs/disenos/` a este DESIGN.md; después, borrar los otros temas
  (pasos en `docs/diseno.md`).
- Do pasar `npx @google/design.md lint` sobre cada DESIGN.md antes de subirlo.
- Don't mezclar piezas de dos mundos en una misma pantalla.
