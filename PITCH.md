# Guion del pitch (3 minutos)

Para decir en voz alta antes o durante la demo. La demo en vivo (qué se ve en pantalla, tiempos y plan B) está en [`DEMO.md`](DEMO.md); aquí solo va la historia. Ajusten las frases a su estilo: lo importante es el orden.

## 1. El problema (30 s)

> "En muchos países, la gente ahorra en grupo con una **tanda**: todos ponen la misma cuota y cada ronda uno se lleva todo el dinero. Funciona por confianza. Y tiene un riesgo conocido: **el que cobra primero puede desaparecer** y el resto se queda sin su plata."

## 2. La idea (30 s)

> "Rounda pone las reglas de la tanda en un **contrato inteligente**. El contrato guarda el dinero, así que nadie se va con él. Para que cobrar primero no sea una ventaja, **quien cobra antes deja más garantía**. Si alguien no paga, su garantía paga por él. Y mientras la garantía espera, genera rendimiento."

Cifras para que se entienda (3 personas, cuota de 100): la garantía es **200** para quien cobra primero y **100** para los otros dos.

## 3. La demo (90 s si es corta, 5 min si es completa)

Muestren el momento clave y nada más:

- "Ana cobró 300." (ronda 1, todos pagan)
- **"Ana no pagó: su garantía cubrió 100 TUSD."** El grupo no pierde nada. Quien cobra recibe la bolsa completa. *Este es el momento por el que existe el proyecto.*
- "Beto pagó tarde": pagar tarde tiene costo, una multa que se reparte entre quienes cumplieron.
- "Resultados finales": cuánto recibió cada quien y cuánto rindió la garantía.

Si el jurado tiene tiempo: que prueben con su cuenta de Google (sin instalar nada) o con Freighter.

## 4. Por qué Stellar (20 s)

> "Las transacciones son rápidas y baratas, y los contratos son públicos: **cualquiera puede revisar las reglas y cada pago**. Además, con Soroban el contrato maneja el dinero directamente, sin un intermediario que lo custodie."

## 5. Qué sigue (20 s)

Digan solo lo que es cierto hoy:

- La bóveda es **simulada**; el siguiente paso es un adaptador a **Blend** para rendimiento real (la interfaz ya lo permite sin tocar el contrato de la tanda).
- Hoy corre en **testnet** y no está auditado.
- Falta una auditoría y decidir el modelo de custodia de las billeteras antes de pensar en dinero real.

## Preguntas difíciles y cómo responderlas

| Pregunta | Respuesta honesta |
| --- | --- |
| ¿Es dinero real? | No. Es testnet con TUSD de prueba. |
| ¿Qué pasa si alguien no paga? | Su garantía cubre su cuota y quien cobra recibe la bolsa completa. Si la garantía no alcanza, queda en mora y su parte se reparte entre quienes cumplieron. |
| ¿Por qué alguien dejaría una garantía? | Porque la recupera al final, junto con su parte del rendimiento, menos las multas si se atrasó. Y a cambio la tanda es segura para todos. |
| ¿Quién cierra las rondas? | Cualquiera, cuando vence el plazo. Así nadie puede bloquear la tanda. |
| ¿Y el rendimiento? ¿Es real? | Hoy es simulado y, en la demo, el tiempo corre más rápido. El plan es conectarlo a Blend. |
| ¿Está auditado? | No. Es un prototipo de hackathon. |
| ¿Quién guarda la llave de quien entra con Google? | Privy. Es cómodo para probar sin instalar nada; para producción habría que evaluar el modelo de custodia. |
| ¿Qué pasa si el sitio se cae? | El contrato sigue en la red y cualquiera puede leerlo y operar con él. El sitio es solo una interfaz. |
| ¿Por qué no un banco o una app de ahorro? | La diferencia es que las reglas no dependen de que alguien las cumpla: las ejecuta el contrato y se pueden verificar. |

Si no saben una respuesta, es mejor decirlo ("no lo hemos probado") que improvisar.
