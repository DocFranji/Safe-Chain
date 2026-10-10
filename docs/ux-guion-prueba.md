# Guion de prueba con personas (UX)

**Para qué:** ver si una persona que no sabe de tecnología ni de cripto puede **crear una tanda** y **unirse a otra** sin ayuda. Lo que aprendamos decide qué arreglamos primero.

**Quién:** de 3 a 5 personas que **no** sean del equipo ni trabajen en tecnología. Por ejemplo, alguien de la familia, una vecina o un compañero de otra carrera. Mejor si ya han estado en una tanda.

**Cuánto dura:** 20 minutos por persona. Una persona del equipo **guía** (lee el guion) y otra **anota**. Si van solos, graben la pantalla y el audio (con permiso).

**Qué se necesita:**
- Un celular con la vista previa de `integracion` abierta (la URL de Vercel que da el orquestador). Probar en celular, no en computadora: así la va a usar la gente.
- Una cuenta de Google de prueba para la persona (o la suya, si quiere: el dinero es de práctica).
- Una tanda **abierta** con un lugar libre para el paso 3. La crea alguien del equipo antes, con el enlace listo para mandar por WhatsApp.
- Esta hoja y la tabla de notas del final.

---

## Reglas para quien guía

1. **No ayudes.** Si la persona pregunta "¿y ahora qué?", responde: *"¿Qué harías si yo no estuviera?"*. Solo ayuda si lleva más de 2 minutos trabada, y anota que pasó.
2. **Pídele que piense en voz alta:** *"Dime lo que vas viendo y lo que piensas, aunque parezca obvio."*
3. **No expliques la app antes.** Solo di lo que dice el guion.
4. **No defiendas el diseño.** Si algo no le gusta, anota y sigue.
5. Recuérdale que **el dinero es de práctica**: no puede perder nada.

---

## Guion (20 min)

### 0. Bienvenida (2 min)

> "Gracias por ayudarnos. Estamos probando una app, no a ti: si algo no se entiende, es culpa de la app. Es dinero de práctica, no puedes perder nada. Te voy a pedir unas tareas; por favor piensa en voz alta."

Pregunta antes de empezar:
- ¿Alguna vez estuviste en una tanda? ¿Cómo funcionaba? ¿Alguna vez alguien no pagó?

### 1. Primera impresión (2 min)

Abre la app en la portada y dale el celular.

> "Mira esta pantalla 10 segundos. ¿Qué crees que es? ¿Para qué te serviría?"

**Observa:** ¿entiende que es una tanda? ¿Menciona algo de "cripto", "blockchain" o "inversión"? (Si lo menciona, la portada asusta.)

### 2. Crear una tanda (6 min)

> "Imagina que quieres armar una tanda con 4 amigas: cada una pone ₡10 000 por semana (digamos $20). Créala en la app."

**Observa y anota:**
- ¿Cuánto tarda en encontrar el botón de crear?
- ¿Entra con Google sin dudar? ¿Le extraña algo en ese paso?
- ¿Qué campos le cuestan? ¿Cuáles deja como vienen?
- ¿Abre "Opciones avanzadas"? ¿Para qué?
- ¿Entiende el resumen antes de confirmar? Pregúntale: *"Con tus palabras, ¿cómo va a funcionar esta tanda?"*
- ¿Entiende el **depósito de seguridad**? Pregúntale: *"¿Por qué crees que te pide dejar ese dinero? ¿Lo recuperas?"*
- ¿Sabe cómo invitar a sus amigas al terminar?

### 3. Unirse a una tanda por invitación (5 min)

Manda al celular de la persona el enlace de la tanda que preparó el equipo, **por WhatsApp**.

> "Una amiga te mandó esto por WhatsApp. Únete a su tanda."

**Observa y anota:**
- ¿Entiende quién la invita y cuánto va a poner por semana antes de entrar?
- ¿Sabe cuánto dinero va a dejar y cuándo lo recupera?
- ¿Tiene que hacer algo raro para conseguir dinero (de práctica)?
- ¿Se queda segura de que ya está dentro? Pregúntale: *"¿Ya estás en la tanda? ¿Cómo lo sabes?"*

### 4. ¿Qué me toca? (3 min)

Abre una tanda en curso donde a la persona le toque pagar (la prepara el equipo con una cuenta de prueba).

> "Ya pasó una semana. ¿Qué tienes que hacer ahora? ¿Para cuándo?"

**Observa:** ¿encuentra el botón de pagar sin buscar? ¿Sabe cuándo cobra ella? ¿Entiende la rueda o la lista de personas?

### 5. Cierre (2 min)

Preguntas:
1. "Del 1 al 5, ¿qué tan fácil fue? ¿Por qué?"
2. "¿Hubo alguna palabra que no entendiste?" (Anótalas **todas**, tal cual.)
3. "¿Qué fue lo más confuso?"
4. "¿Usarías esto con tu familia o tus amigos? ¿Qué te daría confianza?"
5. "Si pudieras cambiar una sola cosa, ¿cuál sería?"

---

## Tabla de notas (una por persona)

| Tarea | ¿Lo logró sola? (sí / con ayuda / no) | Tiempo | Dónde se trabó | Palabras que no entendió | Cita textual |
| --- | --- | --- | --- | --- | --- |
| 1. Primera impresión | | | | | |
| 2. Crear | | | | | |
| 3. Unirse | | | | | |
| 4. ¿Qué me toca? | | | | | |

**Puntaje de facilidad (1–5):** ___ · **¿La usaría?:** ___ · **Celular y navegador:** ___

---

## Después de las pruebas

1. Junten las notas de todas las personas en el tablero (issue #4), con el título **"[UX] Resultados de la prueba con personas"**.
2. Ordenen los problemas: **cuántas personas** tropezaron en cada uno y si **bloqueó** la tarea o solo la hizo lenta.
3. Las palabras que nadie entendió van al glosario (`web/src/lib/glosario.ts`): el agente de UX las cambia.
4. Lo que bloqueó a 2 personas o más va **primero**, antes que cualquier otra mejora.

**Qué consideramos éxito** (Definición de Terminado de UX): al menos 4 de 5 personas crean una tanda y se unen a otra **sin ayuda**, y nadie menciona una palabra técnica que no entienda.
