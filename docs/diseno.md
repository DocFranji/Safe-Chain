# Diseño de la web: cinco mundos en prueba

La persona pidió un mundo visual nuevo para toda la web (portada y app), que sirva igual al jurado (video y
computadora) y a la gente en el celular, sin tocar el nombre ni el logo de Rounda. Primero se construyeron dos
direcciones (Carreta de Sarchí y Fintech). Después pidió rediseñar otra vez con las herramientas nuevas del repo, dar
más opciones que esas dos, que la web conecte con la gente, que tenga una identidad marcada y que use una mascota o una
cosa ligada al nombre Rounda. Por eso hay tres mundos más:

- **Lima** (`?tema=lima`): el punto del logo da la vuelta a la rueda y se detiene en quien cobra.
- **Cusuco** (`?tema=cusuco`): la mascota es un cusuco, que se enrolla como una bola para protegerse.
- **Ronda** (`?tema=ronda`): la tanda es una ronda de personas tomadas de la mano.
- **Carreta de Sarchí** (`?tema=carreta`, el tema por defecto) y **Fintech** (`?tema=fintech`), de la ronda anterior.

Se cambian con la franja negra de arriba ("Diseño en prueba") o con `?tema=` antes del `#` en la URL. Los tres nuevos
tienen modo oscuro: sigue al teléfono, o se fija con `?modo=claro|oscuro` o con el botón "Modo oscuro" de la franja.
La elección queda guardada en el navegador. Los textos, los flujos y los datos son los mismos en todos; cada mundo
tiene su frase en la portada.

Cada mundo nuevo tiene su DESIGN.md completo en formato de Google (`docs/disenos/lima.md`, `cusuco.md`, `ronda.md`,
validados con `npx @google/design.md lint`); el `DESIGN.md` de la raíz es el índice.

**Cuando el equipo elija uno:** se copia su archivo de `docs/disenos/` a `DESIGN.md`; se borran
`web/src/lib/tema.ts`, `web/src/components/SelectorTema.tsx`, los bloques de los temas que no quedaron en
`web/src/index.css`, `web/src/temas.css` y `web/src/landing/landing.css`, y los dibujos de rueda que no se usen
(`RuedaCarreta.tsx`, `RuedaLima.tsx`, `RuedaCusuco.tsx`, `RuedaRonda.tsx` o `RuedaAnillo` en `Rueda.tsx`). Si queda
Cusuco, también se queda `Cusuco.tsx`. Lo común queda en `App.css`.

## Herramientas usadas en esta ronda

- **Taste** (`design-taste-frontend`): lectura del pedido, diales, protocolo de rediseño y la revisión final. De ahí
  salen la promesa en dos renglones, el subtítulo de 20 palabras, una sola etiqueta por intención ("Abrir la app" en
  la barra, la portada y el cierre), cuatro composiciones distintas en la portada, una pieza oscura como máximo, cero
  rayas largas en textos visibles, sin etiquetas sobre los títulos y modo oscuro en los mundos nuevos.
- **UI/UX Pro Max** (`search.py --design-system`, dominios de producto, color y tipografía): el patrón "Minimal &
  Direct + Demo" del tipo "Expense Splitter" (dinero entre amigos), con un color por estado y un color por persona.
  Sus paletas sugeridas (dorado con morado, Inter) chocaban con Taste y se descartaron con razones.
- **DESIGN.md de Google + awesome-design-md:** formato y lint de los cuatro DESIGN.md; la referencia de Wise para Lima
  (un solo acento verde para actuar, tarjetas muy redondeadas, títulos pesados).
- **Stop Slop:** textos de la portada sin relleno, sin contrastes de manual ("no es X, es Y") y sin rayas largas. Las
  rayas que quedaban en la app (celdas vacías) pasaron a guion.
- **redesign-existing-projects:** auditoría del estado anterior antes de tocar nada; se mantienen rutas, textos que
  revisan las pruebas y flujos.
- **Impeccable** (piso de calidad y revisión), **Emil Kowalski** (curvas y tiempos de movimiento) y **Addy Osmani**
  (tramos verificados, revisión del código), como en la ronda anterior.
- **Figma MCP:** la generación de imágenes funciona, pero la red de este entorno bloquea `www.figma.com` y no se
  pudieron bajar; la mascota y las figuras se dibujaron en SVG propio. Con ese dominio permitido se pueden sumar
  ilustraciones o fotos generadas.
- **Context7:** rutas de importación de las fuentes variables de Fontsource. **Playwright** (capturas en claro y oscuro,
  escritorio y 390 px, y las 351 pruebas de navegador por tema) y el protocolo de Chrome DevTools a través de
  Playwright para medir rendimiento.
- **Understand-Anything (Egonex-AI):** quedó registrado en `.claude/settings.json`, pero solo carga en sesiones que
  arrancan desde `main`; esta sesión no lo tiene.

## Contrato de dirección: Lima

- **THESIS.** La tanda como una app de finanzas amable y segura, con una marca que se reconoce de lejos: la lima.
- **OWN-WORLD.** Salvia #f0f2ec, tinta #141712, lima #b0e65c (siempre con texto en tinta y borde verde oscuro sobre
  claro), ámbar para el turno. Outfit en todo. Una sola pieza oscura: el cubo de la rueda (y la regla de las reglas
  públicas en la portada).
- **STORY.** La bolsa en el cubo oscuro; los segmentos se llenan de lima al pagar; el punto del logo señala a quien
  cobra.
- **FIRST VIEWPORT.** "La tanda donde nadie se va con la plata." con un resaltador lima que pasa una vez; la rueda a
  la derecha.
- **Gesto propio:** el punto da la vuelta (900 ms, ease-in-out) y se detiene junto a quien cobra.

## Contrato de dirección: Cusuco

- **THESIS.** Una mascota local que explica la promesa sin palabras: el cusuco se enrolla para protegerse, como la
  garantía protege al grupo. Redondo como Rounda.
- **OWN-WORLD.** Cielo #e8f0f7, tinta #1b2433 en contornos de 2 px, turquesa #22b3a6 para actuar, amarillo sol para
  la moneda y el turno, terracota #b4582f solo para la mascota y lo pagado. Nunito en todo.
- **STORY.** La rueda es el caparazón: cada placa se pinta al pagar y la cabeza del cusuco señala a quien cobra.
- **FIRST VIEWPORT.** "Tu tanda, protegida como un cusuco."; el cusuco llega rodando, se desenrolla y saluda junto a
  la rueda.
- **Gesto propio:** la llegada rodando (una vez); en la app, el cusuco enrollado rueda mientras algo carga.

## Contrato de dirección: Ronda

- **THESIS.** La tanda es gente antes que números: una ronda de personas tomadas de la mano.
- **OWN-WORLD.** Blanco orquídea #f7f4f8, tinta #221a26, guaria #7b2d8e (la flor nacional) para actuar y para la
  bolsa, mango para el turno, la ropa de cada persona en cuatro colores. Bricolage Grotesque en todo.
- **STORY.** Cada persona lleva su número en la camiseta; la camiseta se pinta al pagar; quien cobra tiene una luz
  mango detrás.
- **FIRST VIEWPORT.** "En esta ronda, todos cobran." y la ronda de ejemplo dando vueltas.
- **Gesto propio:** la ronda gira una ronda a la vez y las personas siguen derechas.

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

## Reglas de movimiento (Emil Kowalski), comunes a todos

1. Cada animación tiene un porqué: entrar sin saltos, confirmar una acción o mostrar un cambio de estado.
2. `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) para entrar o responder; `--ease-in-out` para moverse en
   pantalla (el giro de la rueda). Nunca `ease-in`.
3. Apretar 140 ms, hover y avisos 200 ms, páginas 280 ms. Solo celebrar (pagar, cobrar) o girar la rueda dura más.
4. Solo `transform` y `opacity` en HTML. En SVG, `transform` recalcula el diseño en cada cuadro: nada infinito ahí.
5. Nada aparece desde `scale(0)`. Hover solo con mouse. Con "reducir movimiento" quedan los fundidos.
6. Un solo momento animado por pantalla: en la portada, la rueda de ejemplo (en Cusuco, además, la llegada de la
   mascota, una sola vez).

## Piso de calidad (Impeccable) que se cumplió

Sin etiquetas sobre los títulos, sin texto con degradado, sin bordes de color a un lado (la historia es una línea de
tiempo con puntos), sin números en listas que no son secuencia, sin caracteres como íconos (la marca de "ya cobró"
es un trazo SVG), fuentes servidas desde el propio sitio, contraste AA en textos (también sobre amarillo y en los
niveles del historial).
