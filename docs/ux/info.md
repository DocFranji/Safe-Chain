# El botón "i" de información

Un círculo pequeño con una "i" junto a un título o una pregunta. Al **pasar el cursor** (o enfocarlo con el teclado, o tocarlo en el celular) se despliega un globo con la explicación. Así la letra pequeña no ocupa la pantalla y quien la necesita la tiene a un gesto.

Código: `components/Info.tsx` y `components/info.css`. Un solo componente:

```tsx
<Info etiqueta="Sobre la multa">Se descuenta del depósito al final…</Info>
```

`etiqueta` es el nombre del botón para lectores de pantalla (por defecto "Más información"). El contenido puede llevar `<strong>` y texto con variables.

## Cómo se comporta

- **Cursor**: abre al pasar, cierra al salir. **Teclado**: Tab llega a la "i" y la abre; Escape la cierra. **Celular**: un toque la deja fija; otro toque, tocar fuera o Escape la cierran.
- El globo va en el `<body>` con `position: fixed`: no se corta con tarjetas ni tablas, queda dentro de la pantalla (también a 375 px, desde una "i" en el borde) y sale arriba si no cabe abajo. Si la página se desplaza, sigue al botón.
- Accesible: el botón tiene `aria-label` y `aria-expanded`; el globo es `role="tooltip"` enlazado con `aria-describedby`. Dentro de una casilla o un resumen, tocar la "i" no marca ni abre nada más.
- Solo usa los colores de `index.css`: sirve en modo claro y oscuro. Respeta `prefers-reduced-motion`.

## Dónde se usa (y dónde NO)

Se pasó a "i" la **explicación**, no lo que hay que hacer: Crear (las 3 preguntas, multa, depósito, otra duración, moneda, mecanismo de turnos, ofertas selladas, intercambio, historial y la tabla de depósitos), el panel de la tanda (reglas, "Todos pagaron", "Repartir lo que queda"), turnos (cómo funciona el mecanismo, subasta, ofertas selladas), intereses, calendario, resultados e historial.

**Se queda a la vista**: errores y avisos, lo que cuesta o pasa si se actúa (el plazo venció, el depósito que se deja), los pasos siguientes ("Necesitarás confirmar una firma más") y todo lo que lleva un enlace (el globo no se puede tocar). Regla práctica: si quitarlo cambiaría la decisión de quien lee, no va en una "i".

## Para las pruebas

Como el texto ya no está en la página, las pruebas de navegador leen los globos con `globos(page, zona)` (pasa el cursor por cada "i" de la zona y junta los textos). Bloque "UX: botón i de información" en `web/e2e/run.mjs`.
