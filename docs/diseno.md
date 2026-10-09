# Diseño de la web: Órbita

El diseño de Rounda es **Órbita**: la estética y el movimiento de las plantillas de Framer, con círculos y giros
porque la marca es una ronda. La referencia completa (colores, letras, piezas, reglas) está en `DESIGN.md`, en el
formato DESIGN.md de Google; `npx @google/design.md lint DESIGN.md` da 0 errores y 0 avisos.

## Cómo llegamos aquí

1. **Carreta de Sarchí y Fintech.** Dos mundos opuestos. La Carreta tenía personalidad, pero era tan colorida que
   perdía seriedad; la Fintech era seria, pero sin marca y con la barra del color del fondo.
2. **Lima, Cusuco y Ronda.** Tres mundos más, con las herramientas del repo (commit `9718868`).
3. **Sarchí y Montaña.** Dos opciones que combinaban las dos primeras, con fotos de gente, animaciones de marca y
   cada página según su función (PR DocFranji/Safe-Chain#28).
4. **Órbita.** El equipo pidió el nivel de las plantillas de Framer. Dio Vallure como ejemplo y abrió Arewno, Payer y
   Cryptor; se estudiaron en vivo con Playwright, cuadro por cuadro, sin copiar código ni imágenes. **El equipo eligió
   Órbita como diseño definitivo** y se quitaron las otras opciones, la franja "Diseño en prueba" y `?tema=`. Todo
   sigue en el historial de git por si se quiere recuperar algo.

## La idea

- **THESIS.** Una app de finanzas que se siente como las mejores plantillas de Framer, y una marca que se reconoce
  porque todo gira: una tanda es una ronda de personas.
- **De dónde sale cada idea:**

  | Referencia | Qué se tomó |
  | --- | --- |
  | Vallure (la base) | Campo marino con brillo azul, títulos en peso medio que entran palabra por palabra de borroso a nítido, texto que se llena al bajar, bento con microanimaciones, planes, preguntas y cierre en degradado |
  | Arewno | Barra en píldora flotante, celular con anillo de progreso, pasos con números grandes en tarjetas que se apilan al bajar, avisos que flotan |
  | Payer | Anillos concéntricos con caras que giran; caras alrededor de un título; el celular que se endereza al bajar |
  | Cryptor | Una fila de círculos que pasa por un centro que brilla; ondas que se abren alrededor de un ícono |

- **FIRST VIEWPORT.** "La tanda de siempre. Nadie se va con la plata." en blanco y azul claro sobre el marino.
  Debajo, un celular con la app: la rueda de ejemplo en vivo y la lista de quién pagó, sincronizadas. Alrededor, tres
  anillos con caras que giran y tres avisos que cambian con la ronda.
- **Gesto propio: la ronda de personas.** Nueve caras recortadas de nuestras fotos (2 a 3 KB cada una) giran en
  órbitas en la portada, en la gente y en el cierre, y pasan una por una por el logo en el haz.
- **La app:** barra marina con el logo en blanco y una línea azul que brilla; piezas blancas redondeadas con sombras
  en capas; botones, etiquetas y filtros en píldora; la rueda con lo pagado en azul y el punto del logo, en ámbar,
  junto a quien cobra; Geist en peso medio para todo.
- **Modo oscuro:** sigue al teléfono o la computadora; `?modo=claro|oscuro` antes del `#` lo fija (para grabar el
  video). La demo va siempre en oscuro porque se proyecta. Ver `web/src/lib/apariencia.ts`.

## Dónde está

| Pieza | Archivo |
| --- | --- |
| Colores y letras (claro y oscuro) | `web/src/index.css` |
| Lo propio de la marca en la app (barra, piezas, rueda) | `web/src/temas.css` |
| Cada página según su función | `web/src/paginas.css` |
| Movimiento de la app | `web/src/movimiento.css` |
| La portada | `web/src/landing/Landing.tsx` y `landing.css` |
| Piezas de movimiento (títulos, órbitas, contadores, texto que se llena) | `web/src/landing/piezas.tsx` y `movimiento.ts` |
| La tanda de ejemplo que comparten la rueda y el celular | `web/src/landing/muestra.ts` y `RuedaMuestra.tsx` |
| La rueda | `web/src/components/RuedaOrbita.tsx` (el modelo en `web/src/lib/rueda.ts`) |
| Modo claro u oscuro y letras | `web/src/lib/apariencia.ts` |

## Movimiento

| Dónde | Qué pasa | Para qué |
| --- | --- | --- |
| Portada, al cargar | La promesa entra palabra por palabra, de borrosa a nítida (parte un poco visible para no retrasar el LCP); insignia, subtítulo y botones después | Presentar la marca con el ritmo de Framer |
| Portada, siempre | Tres anillos con caras giran (70, 100 y 140 s por vuelta, en dos sentidos); los avisos flotan; la rueda avanza una ronda cada 3.9 s | La ronda de personas: la marca |
| Portada, al bajar | El celular se endereza (animación ligada al scroll, donde el navegador la permite) | Profundidad, como Payer |
| El haz | Las caras pasan por el logo (42 s); la cinta de usos corre al revés | A cada quien le toca su turno |
| Qué es | Cada palabra pasa de gris a tinta según el scroll | Leer al ritmo de quien baja |
| Pasos | Las tarjetas se apilan al bajar (sticky) | Mostrar que es una secuencia |
| Seguridad | Las barras crecen; los recibos caen y se acomodan; las ondas se abren alrededor del logo con la ronda de caras; el anillo de rendimiento se llena y su punto lo recorre | Explicar cada regla con un gesto |
| La gente | Dos anillos de caras giran alrededor del título; las cifras cuentan desde cero; un punto recorre la foto en círculo | La gente detrás de cada tanda |
| Preguntas | Se abren con altura animada; el + gira y se vuelve × | Leer sin saltos |
| Cierre | Anillos con caras detrás del título | Volver a la ronda al final |
| App, al entrar | La línea azul de la barra se traza (una vez: la barra no se vuelve a dibujar al cambiar de página) | La marca |
| Lista de tandas | Los lugares ocupados se llenan uno tras otro (35 ms entre uno y otro) | Ver cuánto falta para arrancar |

Reglas (Emil Kowalski):

1. Cada animación tiene un porqué: entrar sin saltos, confirmar una acción o mostrar un cambio de estado.
2. `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) para entrar o responder; `--ease-in-out` para moverse en
   pantalla. Nunca `ease-in`.
3. Apretar 140 ms, hover y avisos 200 ms, páginas 280 ms. Solo celebrar o girar dura más.
4. Solo `transform`, `opacity`, `filter` y el trazo del SVG. Los bucles se pausan fuera de pantalla (`data-activo`).
5. Nada aparece desde `scale(0)`. Hover solo con mouse. Con "reducir movimiento" nada se mueve ni se esconde.

## Cada página según su función (`web/src/paginas.css`)

`App.tsx` pone `data-pagina` en `.app` con el tipo de ruta; cada página se ajusta a lo que la gente viene a hacer.

| Página | Función | Cómo se nota |
| --- | --- | --- |
| Portada (`#/`) | Convencer y entrar | La promesa, el celular con la rueda en vivo, la ronda de personas, los pasos, la seguridad, ritmos con números reales y preguntas |
| Tandas (`#/tandas`) | Comparar y elegir | La bolsa en grande, los lugares libres como la rueda en chiquito, la línea de entrada resaltada en las abiertas |
| Tanda (`#/tanda/N`) | Pagar y cobrar | La acción del momento a todo el ancho y más alta; en el celular, el panel va antes de la rueda |
| Crear (`#/crear`) | Llenar un formulario | Título más bajo, campos de 52 px, la vista previa fija al lado mientras se llena |
| Demo (`#/demo`) | Proyectar ante el jurado | Escenario oscuro con un brillo azul, letra grande y la rueda al centro |
| Historial y perfil | Leer | Una columna de 44 rem, más interlineado, el nivel como un sello |
| Estado (`#/estado`) | Diagnosticar | Filas compactas y los datos técnicos en letra de ancho fijo |

## Fotos

Las fotos son ilustrativas, hechas con la IA de imágenes de Figma (modelo `gemini-3.1-flash-image`): personas que no
existen, en escenas de Costa Rica. El pie de la portada lo avisa. En `web/src/assets/fotos/` quedan `familia.webp`
(la foto en círculo de la gente, con carga diferida) y `caras/` (nueve recortes de 112 px que giran en las órbitas).
Para el producto después del hackathon conviene cambiarlas por fotos reales con permiso: basta con reemplazar los
archivos.

## Herramientas usadas

- **Framer** (Vallure, Arewno, Payer, Cryptor) estudiado con **Playwright**: capturas cuadro por cuadro, medidas de
  letra, color y sombra, y qué se anima.
- **Skills del repo:** Taste (diales, promesa en dos renglones, una etiqueta por intención), Impeccable (piso de
  calidad), UI/UX Pro Max, redesign-existing-projects (grano, sombras teñidas, asimetría, estados de hover y presión),
  Emil Kowalski (movimiento), Stop Slop (textos), DESIGN.md de Google (la referencia y su lint), Addy Osmani (tramos
  verificados y revisión del propio diff).
- **Figma MCP:** las fotos, con su IA de imágenes; láminas con variables en el archivo de Figma.
- **Context7** (fuentes de Fontsource) y el protocolo de **Chrome DevTools** (CLS y LCP).

## Piso de calidad

- Fuentes servidas desde el propio sitio y pedidas antes de dibujar, con un tope de 400 ms.
- Contraste AA en claro y oscuro: el par más bajo es 5.8:1.
- Sin caracteres como íconos; la marca de "ya cobró" es un trazo SVG.
- Sin testimonios ni cifras inventadas: los números salen de los ejemplos de "Crear" y de las reglas del contrato.
- Detalles del navegador (cursor de texto, barras de desplazamiento, color de los controles) con los colores de la
  marca.

Mediciones de la portada con el protocolo de Chrome DevTools (vía Playwright): CLS 0.000 y LCP de unos 0.5 s, a 1440
y a 390 px.
