# Design

Dos mundos visuales en prueba para Rounda, elegibles con `?tema=carreta|fintech` (ver `docs/diseno.md` para los
contratos de dirección y `PRODUCT.md` para la verdad del producto). Las variables tienen el mismo nombre en los dos;
los valores viven en `web/src/index.css` y las piezas propias de cada mundo en `web/src/temas.css` y
`web/src/landing/landing.css`.

## Tokens

| Variable | Carreta de Sarchí | Fintech | Uso |
| --- | --- | --- | --- |
| `--papel` | `#ffffff` | `#f5f6f8` | Fondo |
| `--superficie` | `#ffffff` | `#ffffff` | Paneles y tarjetas |
| `--superficie-2` | `#fff3cc` | `#f0f2f5` | Resaltado suave, hover |
| `--tinta` | `#1a1410` | `#0d1117` | Texto principal |
| `--tinta-2` | `#5c5048` | `#5b6472` | Texto secundario (≥ 6:1 sobre blanco) |
| `--linea` | tinta al 14 % | `#e3e6eb` | Divisiones |
| `--borde` | `#1a1410` | `#c9ced6` | Contorno de piezas y campos |
| `--grosor` | `2px` | `1px` | Grosor de los contornos |
| `--marca` | `#c8261b` (rojo carreta) | `#0b7a5c` | Barra, portada, cierre |
| `--acento` | `#1e46a8` (cobalto) | `#0b7a5c` | Acción principal |
| `--turno` | `#f6b800` | `#f59e0b` | A quien le toca cobrar, lo elegido |
| `--pago` | `#1e8449` | `#0e9f6e` | Pagó, correcto |
| `--alerta` | `#b8211a` | `#d9480f` | Vencido, mora, error |
| `--radio` / `--radio-chico` | `16px` / `10px` | `16px` / `12px` | Esquinas |
| `--sombra` | ninguna (contorno de tinta) | sombra fina de dos capas | Profundidad |
| `--titulos` | Bungee (400) | Geist (650, −0.02em) | Títulos y cifras grandes |
| `--texto` | Atkinson Hyperlegible Next | Geist | Texto |

Colores de la rueda de la carreta: `--c-rojo`, `--c-amarillo`, `--c-azul`, `--c-verde` (y `--c-naranja` para la
gráfica). Ningún segmento comparte color con sus vecinos (`coloresSinRepetir` en `web/src/lib/rueda.ts`).

## Movimiento

`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` para entrar y responder; `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
para moverse en pantalla. `--t-presion: 140ms`, `--t-rapido: 200ms`, `--t-medio: 280ms`. La rueda de la carreta gira
en 900 ms y pinta un segmento en 500 ms. Detalle en `docs/diseno.md`.

## Componentes con carácter propio

- **La rueda** (`Rueda.tsx`, `RuedaCarreta.tsx`): en la carreta, un segmento por persona dentro de una llanta blanca,
  la flecha arriba marca quién cobra y la rueda gira una ronda a la vez; en fintech, un anillo de tiempo con un
  círculo por persona.
- **La barra**: roja con fleco de triángulos amarillos (carreta) o blanca con línea (fintech), pegada arriba en
  pantallas anchas.
- **La historia**: línea de tiempo con un punto por evento, del color de lo que pasó.
- **Botones**: ceden al apretar (`scale(0.97)`); en la carreta, con contorno de tinta.

Fuentes servidas desde el sitio (`@fontsource`): Bungee, Geist y Atkinson Hyperlegible Next.
