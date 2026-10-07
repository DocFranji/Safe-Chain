# Diseño de la web: dos mundos en prueba

La persona pidió un mundo visual nuevo para toda la web (portada y app), que sirva igual al jurado (video y
computadora) y a la gente en el celular, sin tocar el nombre ni el logo de Rounda. Eligió construir **dos**
direcciones para compararlas con la web de verdad y decidir después:

- **Carreta de Sarchí** (`?tema=carreta`, el tema por defecto)
- **Fintech** (`?tema=fintech`)

Se cambian con la franja negra de arriba ("Diseño en prueba") o con `?tema=` antes del `#` en la URL. La elección
queda guardada en el navegador. Los textos, los flujos y los datos son los mismos en los dos.

**Cuando el equipo elija uno:** se borran `web/src/lib/tema.ts`, `web/src/components/SelectorTema.tsx`, el bloque
del tema que no quedó en `web/src/index.css`, `web/src/temas.css` y `web/src/landing/landing.css`, y el dibujo de la
rueda que no se use (`RuedaCarreta.tsx` o `RuedaAnillo` en `Rueda.tsx`). Lo común queda en `App.css`.

Herramientas: las skills Impeccable (`init`, `new-work`, piso de calidad y revisión final), Emil Kowalski (movimiento)
y las de Addy Osmani (frontend-ui-engineering, planificación e implementación por tramos). El lanzador binario de
Impeccable no corre en la nube (descarga un ejecutable), así que se siguieron sus guías a mano; la verdad del producto
está en `PRODUCT.md`.

## Contrato de dirección: Carreta de Sarchí

- **THESIS.** La tanda es la rueda pintada de la carreta: cada persona es un segmento y la rueda gira una ronda a la
  vez. Rechaza el tablero oscuro con un acento neón que usa toda la categoría (y que usaba la versión anterior).
- **OWN-WORLD.** Fondo blanco; contornos de tinta `#1a1410` de 2–3 px; rojo carreta `#c8261b` en la barra y la
  portada, con un fleco de triángulos amarillos; amarillo `#f6b800` para el turno y lo elegido; cobalto `#1e46a8`
  para actuar; verde `#1e8449` para lo pagado. Bungee (letra de rótulo) en títulos y cifras; Atkinson Hyperlegible
  Next en el texto.
- **STORY.** En un vistazo se entiende que el dinero gira por turnos y que el contrato lleva la cuenta: quién cobra
  (bajo la flecha), quién ya pagó (su segmento pintado), quién ya cobró (la marca). Después se entra con Google o
  Freighter.
- **FIRST VIEWPORT.** Barra roja. A la izquierda, la promesa en Bungee blanco y amarillo (≈78 px), la explicación y
  la tarjeta para entrar con el botón cobalto. A la derecha, la rueda de ejemplo (5 personas) girando, con la bolsa
  en el cubo.
- **FORM.** La rueda de la carreta pintada. Dirección fijada por la persona (no hubo tirada de `concept-seed`: el
  lanzador no corre aquí).
- **Gesto propio:** la rueda gira (900 ms, ease-in-out) cuando avanza la ronda, y el segmento se pinta cuando la
  persona paga.

## Contrato de dirección: Fintech

- **THESIS.** La tanda como una app de finanzas moderna de primer nivel: clara, tranquila, confiable. Es la salida
  estándar de la categoría, hecha en serio y sin rarezas.
- **OWN-WORLD.** Gris `#f5f6f8`, tarjetas blancas con línea `#e3e6eb` y sombra fina, verde de marca `#0b7a5c`,
  ámbar `#f59e0b` para el turno. Geist en todo.
- **STORY.** La misma que la carreta, contada con la sobriedad de una app bancaria.
- **FIRST VIEWPORT.** Barra blanca. A la izquierda, la promesa en Geist (negro y verde), la explicación y la tarjeta
  para entrar. A la derecha, la rueda-anillo dentro de una tarjeta, como se ve en la app.
- **FORM.** El estándar de la categoría ("canon"), pedido por la persona para comparar.
- **Gesto propio:** el anillo del tiempo se vacía con la ronda; el turno late tres veces y se queda quieto.

**FINISH:** sin revisión y sin documentar no está terminado; este trabajo termina con la revisión final, el veredicto
y este documento al día.

## Reglas de movimiento (Emil Kowalski), comunes a los dos

1. Cada animación tiene un porqué: entrar sin saltos, confirmar una acción o mostrar un cambio de estado.
2. `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) para entrar o responder; `--ease-in-out` para moverse en
   pantalla (el giro de la rueda). Nunca `ease-in`.
3. Apretar 140 ms, hover y avisos 200 ms, páginas 280 ms. Solo celebrar (pagar, cobrar) o girar la rueda dura más.
4. Solo `transform` y `opacity` en HTML. En SVG, `transform` recalcula el diseño en cada cuadro: nada infinito ahí.
5. Nada aparece desde `scale(0)`. Hover solo con mouse. Con "reducir movimiento" quedan los fundidos.
6. Un solo momento animado por pantalla: en la portada, la rueda de ejemplo.

## Piso de calidad (Impeccable) que se cumplió

Sin etiquetas sobre los títulos, sin texto con degradado, sin bordes de color a un lado (la historia es una línea de
tiempo con puntos), sin números en listas que no son secuencia, sin caracteres como íconos (la marca de "ya cobró"
es un trazo SVG), fuentes servidas desde el propio sitio, contraste AA en textos (también sobre amarillo y en los
niveles del historial).
