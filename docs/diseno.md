# Diseño y movimiento de la web (v2)

La app (`#/tandas`, `#/tanda/N`, `#/crear`, `#/demo`, `#/historial`, `#/estado`) ahora habla el mismo idioma visual
que la landing: el brillo verde, la cuadrícula de fondo, superficies con profundidad y movimiento con intención.
La idea de Rounda no cambia: ningún texto, flujo ni dato cambió.

- Figma (tokens + hoja de referencia): https://www.figma.com/design/kGH33fXEVA6QCRwT5KQqSL
- Código: los tokens están en `web/src/index.css`, todo lo que se mueve en `web/src/movimiento.css` y las superficies en `web/src/App.css`.

## Reglas (filosofía de Emil Kowalski)

1. **Cada animación tiene un porqué**: entrar sin saltos, confirmar una acción o mostrar un cambio de estado.
2. **Curvas fuertes**: `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) para entrar o responder; `--ease-in-out`
   para moverse en pantalla. Nunca `ease-in` en la interfaz.
3. **Rápido**: apretar 140 ms (`--t-presion`), hover y avisos 200 ms (`--t-rapido`), páginas y tarjetas 280 ms
   (`--t-medio`). Solo lo que celebra (un pago, un cobro) dura más.
4. **Solo `transform` y `opacity`**: no mueven el diseño ni gastan batería. En SVG, `transform` sí recalcula el
   diseño en cada cuadro: por eso el halo del turno late 3 veces y se queda quieto.
5. **Nada aparece desde `scale(0)`**: mínimo 0.9 con opacidad.
6. **Hover solo con mouse** (`@media (hover: hover) and (pointer: fine)`): en el celular, un toque deja el hover pegado.
7. **Reducir movimiento**: quedan solo los fundidos de opacidad; sin desplazamientos ni bucles.
8. **Usar `backwards`, no `both`**, en las entradas: una animación de `transform` que queda "llena" convierte al
   elemento en contenedor de los `position: fixed` de adentro.

## Qué se mueve

| Qué | Cómo |
| --- | --- |
| Botones, filtros, tarjetas, modos | Ceden al apretar (`scale(0.97–0.985)`) |
| Tarjetas del lobby | Se levantan 3 px con borde verde al pasar el mouse |
| Cambio de página | El contenido sube 8 px y aparece (280 ms) |
| Tarjetas, historia, chequeos, pasos | Entran escalonadas cada 40 ms |
| Barra superior | Pegada arriba; el vidrio aparece al bajar (animación atada al scroll, sin JavaScript) |
| Rueda | Las personas entran en orden; el turno tiene halo (3 latidos); el anillo de "pagó" se dibuja; la marca de "cobró" salta |
| "En curso" | Un punto verde que late (solo opacidad) |
| "Leyendo…" | Aro que gira rápido y un brillo que cruza el texto |
| Desplegables | La flecha gira y el contenido se funde (sin animar la altura: el contenido está desde el primer instante) |

## Medido (Playwright + protocolo de DevTools, con RPC simulado)

| Página | CLS antes | CLS después |
| --- | --- | --- |
| `#/tandas` | 0.426 | 0.136 |
| `#/tanda/2` | 0.202 | 0.130 |
| `#/crear` (390 px) | 0.592 | 0.246 |
| `#/demo/2` | 0.041 | 0.020 |

En reposo (3 s), el lobby hace 10 recálculos de estilo y 0 de diseño. Lo que queda en la tanda es el arco del
tiempo, que ya existía.

## Arreglo de paso

En el celular, el menú partía "Demo en vivo" y "Mi historial" en varios renglones y la píldora activa se volvía un
círculo blanco enorme (también en producción). Ahora es una sola fila que se desliza de lado.
