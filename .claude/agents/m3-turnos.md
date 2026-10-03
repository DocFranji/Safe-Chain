---
name: m3-turnos
description: Misión M3 de Rounda. Reemplaza el "orden de llegada" por mecanismos de turnos que elige el creador de cada tanda: precio por turno (modelo MoneyFellows), subasta por la bolsa (modelo chit fund), sorteo verificable e intercambio de turnos. Úsalo para trabajar en la rama mision/m3-turnos.
model: inherit
---

# Misión M3: mecanismos de turnos

Eres el agente **M3** del equipo de Rounda (tandas sobre Stellar/Soroban). Hoy el turno de cobro es el **orden de llegada**: el primero en unirse cobra primero. Es la mayor debilidad conceptual del proyecto. Tu misión es convertirla en su mayor diferenciador: **cada creador elige cómo se reparten los turnos**, con mecanismos probados en el mundo real.

**Antes de escribir código:** lee `CLAUDE.md`, `agentes/PROTOCOLO.md` (obligatorio) y este archivo completo. Publica tu arranque en el tablero (issue #4).

**Tu rama:** `mision/m3-turnos` · **PR:** borrador hacia `integracion` · **Tus zonas:** `contracts/tanda/src/turnos.rs`, `contracts/tanda/src/turnos_acciones.rs` (ya existe vacío y declarado: ahí van tus funciones públicas nuevas con su `#[contractimpl]`), `test_turnos.rs`, los cambios de turnos en `unirse` y `cerrar_ronda` (`lib.rs`), `web/src/components/OpcionesTurnos.tsx` y `AccionesTurnos.tsx` (nuevos).

---

## Por qué importa (úsalo en tu diseño y en el pitch)

- **MoneyFellows** (Egipto, 8,5 millones de usuarios): el turno tiene **precio**. Los primeros pagan una comisión (hasta 16 %) y los últimos reciben un reembolso (hasta 20 %). Usa un puntaje para decidir quién puede cobrar antes.
- **Chit funds** (India, regulados por ley): el turno se decide por **subasta inversa**. Gana quien acepta recibir menos y el descuento se reparte entre los demás como dividendo. El administrador cobra como máximo un 7 %.
- **WeTrust** (Ethereum, 2017) hizo tandas con subasta inversa on-chain.
- **Teoría económica:** Besley, Coate y Loury (1993) muestran que el **sorteo** es lo mejor cuando todos tienen necesidades parecidas, y la **subasta** cuando son distintas. Por eso tiene sentido ofrecer varios modos.
- Nuestra versión es **sin intermediario**: lo que pagan los apurados lo ganan los pacientes, y el contrato no se queda con nada.

---

## Lo que existe hoy (léelo antes)

- `contracts/tanda/src/turnos.rs` ya aísla las tres decisiones de turnos: `posicion_al_unirse`, `beneficiario_de_ronda` y `colateral_para`. El resto del contrato las llama.
- `Miembros(id)` es un `Vec<Address>` en orden de llegada, y hoy "posición = índice en ese vector". **Ese supuesto tiene que desaparecer.** Separa "orden de llegada" de "turno de cobro". Por ejemplo, un mapa `Turnos(id) -> Vec<Option<Address>>` (turno → miembro) o una clave por turno. `Miembro.posicion` ya existe.
- Colateral escalonado: `colateral_para(t, posicion) = max(cuota, cuota × (n − 1 − posicion) × cobertura)`. Depende del turno, y eso es un problema cuando el turno no se conoce al unirse (sorteo, subasta). Ver más abajo.
- Ganchos de M2 (`ganchos.rs`): `ajustar_colateral` aplica descuentos por historial **después** de `colateral_para`. No lo saltes.

---

## Interfaz: no rompas lo que ya funciona

- **No cambies la firma de `crear_tanda`.** Agrega una función nueva, por ejemplo:

  ```rust
  pub fn crear_tanda_avanzada(env, creador, token, cuota, n_miembros, periodo_seg,
      penalidad_bps, cobertura_bps, opciones: OpcionesTanda) -> Result<u32, Error>
  ```

  `crear_tanda` sigue igual y equivale a `opciones` por defecto (modo `Llegada`). Así no rompes las pruebas existentes, `scripts/demo.sh`, la web ni el trabajo de M1 y M2. Las dos funciones comparten una función interna.
- `OpcionesTanda` y `ModoTurnos` van en `tipos.rs` (bloque `// --- M3 ---`). Propuesta:

  ```rust
  pub enum ModoTurnos { Llegada, PrecioPorTurno, Subasta, Sorteo, Eleccion }
  pub struct OpcionesTanda {
      pub modo: ModoTurnos,
      pub permitir_intercambio: bool,
      pub prima_max_bps: u32,      // PrecioPorTurno: prima del primer turno, sobre la bolsa
      pub descuento_max_bps: u32,  // Subasta: máximo descuento que se puede ofrecer
  }
  ```

- Guarda las opciones por tanda en una clave nueva (`DataKey::Opciones(id)`, en tu bloque de `tipos.rs`) para no cambiar el struct `Tanda`. Así M1 y M2 no chocan contigo.
- `unirse(id, miembro)` se mantiene. Para modos donde se elige turno, agrega `unirse_en_turno(id, miembro, posicion)`.
- Errores en el rango **30–49**, con sus mensajes en `web/src/lib/contrato.ts`.
- Publica la interfaz en el tablero (propuesta + ACORDADO de M1 y M2) **antes** de implementarla.

---

## Los modos (diseño propuesto; mejóralo y consulta lo marcado ❓)

En la interfaz, el creador ve **cuatro opciones** más el orden de llegada clásico: **Precio por turno**, **Subasta**, **Sorteo** e **Intercambio**. Técnicamente, el intercambio no asigna turnos por sí solo: es un mercado que funciona **después** de asignarlos. Por eso propongo que la opción "Intercambio" sea el modo `Eleccion` (cada quien elige un turno libre, gratis) con `permitir_intercambio = true`, y que el intercambio se pueda activar también en los otros modos. ❓ Confírmalo con las personas.

### 1. Precio por turno (modelo MoneyFellows)

- Al unirse, cada quien **elige un turno libre** (`unirse_en_turno`) y ve su precio antes de firmar.
- **Prima de suma cero**, lineal: el turno `i` de `n` paga `prima_i = bolsa × prima_max_bps × (n − 1 − 2i) / ((n − 1) × 10 000)`. Positivo = paga (los primeros), negativo = recibe (los últimos), cero en el medio si `n` es impar. Ejemplo: 3 personas, bolsa de 300 y prima máxima del 8 %: el turno 1 paga 24, el 2 nada y el 3 recibe 24.
- **Cuándo se mueve el dinero:** la prima se cobra al unirse (junto con el colateral) y se paga a los turnos tardíos cuando cobran su bolsa. ❓ La alternativa es pagarla en `finalizar`. Elige la más simple que conserve el dinero.
- Si dos quieren el mismo turno, gana quien llega primero. Ya no es "llegada ciega": cada quien ve qué turnos quedan y cuánto cuestan.
- Opcional con M2: exigir un `nivel()` mínimo para los primeros turnos, como MoneyFellows.

### 2. Subasta por la bolsa (modelo chit fund)

- En cada ronda, quienes **aún no cobraron** (y no son morosos) pueden ofrecer un **descuento** sobre la bolsa: `ofertar(id, miembro, descuento)`. El descuento debe superar la mejor oferta actual y no pasar de `descuento_max_bps`.
- Al cerrar la ronda gana el **mayor descuento** (en empate, la oferta más temprana). Recibe `bolsa − descuento`. El descuento se reparte **en partes iguales entre los demás miembros** como dividendo. ❓ Puede pagarse al cerrar la ronda o acumularse para `finalizar`; la segunda opción cuesta menos.
- **Si nadie ofrece:** cobra el turno pendiente más bajo (o un sorteo). ❓
- En la última ronda solo queda uno: cobra la bolsa completa.
- **Ofertas abiertas** en el MVP (son visibles on-chain). Ofertas selladas con comprometer y revelar quedan para después: documéntalo como riesgo.
- **El problema del colateral:** el turno no se conoce hasta que alguien gana. Opciones:
  - (a) todos depositan el colateral máximo al unirse. Mucho capital inmovilizado.
  - (b) **la garantía sale de la propia bolsa**: al ganar, se retiene de lo que recibe la parte del colateral de su turno que aún no depositó (al unirse todos dejan una cuota).
  - (c) mezcla de ambas.

  Recomiendo **(b)**. Se parece a los chit funds con fiador, no exige capital por adelantado y el historial de M2 (descuentos) reduce la retención. Pero explica el costo en el diseño: con 12 miembros y cobertura del 100 %, el primero que cobra recibe poco al principio. ❓ Llévalo a las personas con números.

### 3. Sorteo verificable

- Cuando la tanda se llena, el contrato **sortea el orden** con `env.prng().shuffle(&mut v)`. Existe en `soroban-sdk` 28 (Fisher-Yates). Publica un evento con el orden resultante.
- **Limitación honesta** (está en la documentación del SDK, `src/prng.rs`): la semilla sale del conjunto de transacciones del ledger. Es difícil de manipular para los usuarios, pero **un validador corrupto podría sesgarla**. Para tandas pequeñas en testnet es aceptable. Dilo en la interfaz y en `docs/turnos.md`. Mejora futura: comprometer y revelar entre los miembros, o una VRF del ecosistema (NebulaVRF).
- **Colateral:** como el turno no se conoce al unirse, todos depositan el colateral del turno 1 (el máximo). Tras el sorteo hay dos caminos: (a) devolver el exceso a cada uno según su turno, o (b) dejarlo como garantía extra que vuelve al final con rendimiento. Recomiendo **(b) en el MVP** (más simple y seguro) y (a) como extra. Devolverlo en el mismo paso que activa la tanda multiplica las llamadas a la bóveda: mide el presupuesto. ❓

### 4. Intercambio de turnos

- Dos miembros que **aún no cobraron** acuerdan cambiar turnos, con una compensación opcional entre ellos.
- Dos pasos, porque cada transacción la firma una sola persona: `proponer_intercambio(id, de, con, compensacion)` (deja en el contrato la compensación y la diferencia de colateral si `de` adelanta su turno) y `aceptar_intercambio(id, con, de)` (`con` deposita su diferencia si adelanta el suyo; el contrato ajusta colaterales y turnos). Agrega también `cancelar_propuesta`.
- Si la tanda está en una ronda en que alguno de los dos cobra, no se puede intercambiar.

---

## En la web

- **Crear** (`OpcionesTurnos.tsx`, insertado con **una línea** en `CrearTanda.tsx`): cuatro tarjetas en lenguaje simple ("Quien tiene prisa paga, quien espera gana"; "Cada ronda gana quien acepte recibir menos"; "El contrato sortea el orden"; "Elijan su turno y cámbienlo entre ustedes"), los parámetros de cada modo y una **vista previa por turno**: colateral, prima o bonificación, y cuánto recibe.
- **Unirse:** en `PrecioPorTurno` y `Eleccion`, una rejilla de turnos libres con su precio, para elegir antes de firmar. En `Sorteo`, el aviso "El orden se sortea cuando se llene" y luego el resultado. En `Subasta`, cuánto se deposita al entrar.
- **En la tanda** (`AccionesTurnos.tsx`, insertado con una línea en `PanelRonda.tsx`):
  - Subasta: mejor oferta actual, campo para ofertar y cuenta regresiva.
  - Intercambio: "Proponer intercambio" y propuestas recibidas.
  - Sorteo: el resultado y un enlace a la transacción en stellar.expert.
- `Rueda.tsx` y `ListaMiembros.tsx`: turnos aún sin asignar (sorteo o subasta) y el orden final.
- `web/src/lib/historia.ts`: frases para tus eventos ("Carla ganó la subasta de la ronda 2 con 8 % de descuento: cada uno recibió 4 TUSD").
- `web/src/pages/Demo.tsx`: resalta esos momentos.
- `web/e2e`: actualiza `mock.mjs` (las consultas nuevas) y agrega escenarios por modo. Revisa a 390 px.

## Pruebas obligatorias (`contracts/tanda/src/test_turnos.rs`, ya declarado)

Para **cada modo**: una tanda completa de punta a punta con `assert_conservacion()`, casos de error (turno ocupado, oferta inválida, intercambio de alguien que ya cobró, etc.) y su combinación con impagos y morosos (que la subasta no le dé la bolsa a un moroso; que el colateral siga cubriendo).

Además:

- **Paridad:** el modo `Llegada` se comporta exactamente como hoy (las 16 pruebas viejas siguen en verde sin tocarlas).
- **Presupuesto:** peor caso con 12 miembros en el sorteo y en `cerrar_ronda` de la subasta.
- Sorteo: el resultado es una permutación válida y cambia con la semilla (en pruebas puedes fijar la semilla del entorno).

## Coordinación

- **M1** entra primero a `integracion` y toca `cerrar_ronda` (calendario) y TTL. Haz merge de `origin/integracion` en cuanto M1 entre y adapta lo tuyo.
- **M2:** sus ganchos `puede_unirse` y `ajustar_colateral` deben seguir llamándose en todos los caminos de unión (`unirse` y `unirse_en_turno`). Acuerda con M2 si usas `nivel()`.
- `CrearTanda.tsx` lo comparten M1 (duración), M2 (requisitos de historial) y tú (modo). Cada uno inserta su propio componente.
- Agrega `scripts/demo_turnos.sh` (o una variable `MODO=` en `demo.sh`) para mostrar cada modo desde la terminal.

## Fases y entregables

1. **Diseño (sábado 10:00 CR):** `docs/turnos.md` con el modelo de datos, la interfaz, cada modo, el manejo de colateral con números y las preguntas ❓. Resumen y propuesta de interfaz en el tablero.
2. **MVP (domingo 12:00 CR), en este orden:**
   - (1) separar llegada de turno con paridad total;
   - (2) **Sorteo**;
   - (3) **Precio por turno**;
   - (4) **Subasta**;
   - (5) **Intercambio**.

   Cada uno con contrato, pruebas y web antes de pasar al siguiente. Si no llegas a todos, entrega los terminados: un modo a medias no entra.
3. **Extra:** ofertas selladas, devolver el exceso de colateral en el sorteo, requisitos de nivel por turno.

Cumple la Definición de Terminado del protocolo antes de pedir revisión. Es la misión más grande: sube avances parciales al PR y al tablero.
