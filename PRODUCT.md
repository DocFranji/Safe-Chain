# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Quien organiza o se une a una tanda** en Costa Rica: familias, compañeros de trabajo y grupos de amigos que ya ahorran
  por turnos (la tanda de siempre) y temen que alguien cobre y desaparezca. Lo usan sobre todo en el celular, de día,
  entre otras cosas (en el trabajo, en el bus), y comparten el enlace por WhatsApp.
- **El jurado de Find Your Way (Costa Rica)**: ve un video de 3 minutos y puede entrar a probar la app en una
  computadora, en la red de pruebas.
- Las dos audiencias pesan igual (respuesta de la persona, 6 oct 2026).

## Product Purpose

Rounda es una tanda (ahorro rotativo) cuyas reglas cumple un contrato inteligente en Stellar: todos aportan la misma cuota
cada ronda y, por turnos, uno recibe la bolsa. El contrato cobra a tiempo, aplica multas por atraso y protege a quienes
cobran al final. Éxito: que un grupo pueda hacer su tanda sin confiar en nadie y sin entender de cripto.

## Positioning

La garantía escalonada (quien cobra antes deja más), las multas que se reparten entre quienes cumplen, el rendimiento de
la garantía mientras espera, y un historial crediticio público que da beneficios en otras tandas. Las reglas son públicas
y nadie puede irse con el dinero.

## Operating Context

- Rutas: landing (`#/`), lista de tandas (`#/tandas`), una tanda (`#/tanda/N`), crear (`#/crear`), demo en vivo para
  proyectar (`#/demo`), historial crediticio (`#/historial`), estado del sistema (`#/estado`).
- Se entra con Freighter (extensión de escritorio) o con Google (Privy, en el celular).
- Monedas: TUSD de prueba (rendimiento simulado y acelerado para la demo) y USDC de Blend (rendimiento real).
- Modos de turnos: orden de llegada, precio por turno, subasta, sorteo y elegir e intercambiar.
- Solo testnet: todo el dinero es de prueba.

## Capabilities and Constraints

- Web en React 19 + Vite + TypeScript; router por hash. Las pruebas de navegador (`web/e2e`) revisan textos y flujos.
- Interfaz en español, clara y sin jerga cripto. Montos con 7 decimales; porcentajes en puntos básicos.
- La demo es un video (no hay demo en vivo ante el jurado); entrega: lunes 12 de octubre de 2026, 16:00 CR.
- `main` está en producción (https://rounda-phi.vercel.app); los cambios entran primero por `integracion`.

## Brand Commitments

- El nombre **Rounda** y su logo: un aro con un punto que da vueltas (respuesta de la persona: no se tocan).
- Todo lo demás de la identidad visual puede cambiar (respuesta de la persona: mundo visual nuevo).

## Evidence on Hand

- Contratos desplegados y verificables en el explorador de Stellar (testnet).
- Cuentas de prueba con nombre (Ana, Beto, Carla) para la demo.
- No hay clientes, testimonios, métricas de uso ni prensa: no se inventan.

## Product Principles

1. Nadie se va con el dinero: cada regla se ve antes de firmar.
2. La tanda de siempre, sin cripto a la vista: palabras de la vida real (cuota, turno, bolsa, garantía).
3. El turno es el centro: quién cobra, cuánto y cuándo, siempre a la vista.
4. Honestidad: es testnet, el rendimiento acelerado se dice, y lo que no se probó no se promete.

## Accessibility & Inclusion

- Contraste AA, uso con una mano en el celular, "reducir movimiento" respetado.
- Personas sin experiencia en billeteras ni cripto (inferido del público objetivo).
