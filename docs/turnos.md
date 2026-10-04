# M3 · Mecanismos de turnos

Rama `mision/m3-turnos` · Tablero: issue #4 · Instrucciones: `.claude/agents/m3-turnos.md`.

> Estado: **MVP implementado** (sáb 3 oct, 19:15 CR): contrato, web, pruebas de navegador y `scripts/demo_turnos.sh`. Las cinco preguntas ❓ quedaron **DECIDIDAS por @DocFranji tal como se recomendaron** (tablero, sáb 18:50): ver §8. Cómo se probó: §9.

## En 20 segundos

*"En una tanda de siempre, el orden de llegada decide quién cobra primero. En Rounda lo decide el grupo: pagando por adelantarse, subastando la bolsa, sorteando el orden o intercambiando turnos. Lo que paga quien tiene prisa lo gana quien espera, y el contrato no se queda con nada."*

## Principios

1. **Paridad total.** `crear_tanda` no cambia de firma ni de comportamiento. Una tanda creada así no escribe ninguna clave nueva y sigue exactamente el camino de hoy (las 16 pruebas viejas no se tocan). Lo nuevo solo se activa con `crear_tanda_avanzada(..., opciones)`.
2. **Suma cero, sin intermediario.** Primas, descuentos y compensaciones pasan de unos miembros a otros. El contrato nunca cobra comisión.
3. **La garantía siempre cubre.** Quien cobra deja como garantía lo que aún debe, en todos los modos (la misma fórmula escalonada de hoy). Solo cambia **cuándo** la deposita.
4. **El azar nunca decide a quién se le paga en la misma transacción.** Stellar exige declarar de antemano qué datos toca cada transacción (el *footprint*). Si el ganador se sorteara al pagar, la simulación y la ejecución elegirían a personas distintas y la transacción fallaría. Por eso todo sorteo se guarda primero y se usa en una transacción posterior (ver §5.3).
5. **Lenguaje simple en la interfaz.** Nada de "bps" ni "subasta inversa": "Quien tiene prisa paga, quien espera gana".

---

## 1. Modelo de datos

### Turno ≠ orden de llegada

- `Miembros(id)` sigue siendo la lista en **orden de llegada** (la usan `finalizar`, `cancelar` y otras misiones).
- El **turno de cobro** vive en `Miembro.posicion`. Mientras alguien todavía no tiene turno (sorteo antes de llenarse la tanda, subasta antes de ganar), vale `SIN_TURNO = u32::MAX`.
- En las tandas con opciones, el contrato guarda además el mapa **turno → miembro** (`Turnos(id): Map<u32, Address>`). `beneficiario_de_ronda` lo consulta. En las tandas sin opciones no existe y se usa `miembros.get(ronda)`, como hoy.

### Tipos nuevos (`tipos.rs`, bloque `// --- M3: turnos ---`)

```rust
pub enum ModoTurnos { Llegada, Eleccion, PrecioPorTurno, Sorteo, Subasta }

pub struct OpcionesTanda {
    pub modo: ModoTurnos,
    pub permitir_intercambio: bool,
    pub prima_max_bps: u32,      // PrecioPorTurno: prima del primer turno, sobre la bolsa (máx. 2 000 = 20 %)
    pub descuento_max_bps: u32,  // Subasta: descuento máximo que se puede ofrecer (máx. 5 000 = 50 %)
}

pub struct Oferta { pub ronda: u32, pub miembro: Address, pub descuento_bps: u32 }
pub struct Propuesta { pub de: Address, pub con: Address, pub compensacion: i128 }

/// Todo lo de turnos que la web necesita, en una sola lectura.
pub struct EstadoTurnos {
    pub opciones: OpcionesTanda,
    pub oferta: Option<Oferta>,          // mejor oferta de la ronda actual (subasta)
    pub respaldo: Vec<Address>,          // subasta: orden sorteado para las rondas sin ofertas
    pub propuestas: Vec<Propuesta>,      // intercambios pendientes
    pub fondo_primas: i128,              // precio por turno: primas cobradas que esperan a los últimos turnos
}
```

### Claves (enum propio `ClaveM3` en `turnos.rs`; no toco `DataKey`)

| Clave | Tipo | Cuándo existe |
| --- | --- | --- |
| `Opciones(id)` | `OpcionesTanda` | Solo tandas creadas con `crear_tanda_avanzada` |
| `Turnos(id)` | `Map<u32, Address>` | Tandas con opciones (turnos ya asignados) |
| `Oferta(id)` | `Oferta` | Subasta: mejor oferta de la ronda en curso |
| `Respaldo(id)` | `Vec<Address>` | Subasta: orden sorteado al llenarse |
| `Propuestas(id)` | `Vec<Propuesta>` | Intercambios pendientes (máximo uno por miembro) |
| `FondoPrimas(id)` | `i128` | Precio por turno |

Todas se renuevan con `almacenamiento::renovar_para_tanda` de M1 (ACORDADO) al leer y al escribir.

---

## 2. Interfaz

### Funciones nuevas (`turnos_acciones.rs`, su propio `#[contractimpl]`)

| Función | Firma | Quién | Qué hace |
| --- | --- | --- | --- |
| `crear_tanda_avanzada` | `(creador, token, cuota, n_miembros, periodo_seg, penalidad_bps, cobertura_bps, opciones: OpcionesTanda) -> u32` | creador | Valida las opciones, llama a `crear_tanda` (mismo código, mismas validaciones de M1) y guarda las opciones. Evento `opciones` |
| `unirse_en_turno` | `(id, miembro, posicion: u32)` | miembro | Unirse eligiendo un turno libre (modos `Eleccion` y `PrecioPorTurno`). Mismo cuerpo que `unirse`, con los ganchos de M2 |
| `ofertar` | `(id, miembro, descuento_bps: u32)` | miembro | Subasta: ofrecer un descuento sobre la bolsa de la ronda en curso. Evento `oferta` |
| `proponer_intercambio` | `(id, de, con, compensacion: i128)` | `de` | Propone cambiar su turno por el de `con`. Compensación > 0: `de` le paga a `con` (queda guardada en el contrato). < 0: `con` le paga a `de` al aceptar. Evento `inter_prop` |
| `aceptar_intercambio` | `(id, con, de)` | `con` | Cambia los turnos y mueve la compensación. Evento `inter_ok` |
| `cancelar_propuesta` | `(id, de, quien)` | `de` o `con` | Retira la propuesta y devuelve lo guardado a `de`. Evento `inter_no` |
| `get_opciones` | `(id) -> OpcionesTanda` | lectura | `Llegada` por defecto |
| `get_estado_turnos` | `(id) -> EstadoTurnos` | lectura | Todo lo de turnos en una llamada |
| `cotizar_turno` | `(id, miembro, posicion) -> (i128, i128)` | lectura | `(garantía al unirse, prima)` de ese turno para esa persona, ya con el descuento de historial de M2. Para la vista previa antes de firmar |

`unirse(id, miembro)` se mantiene: en `Eleccion`/`PrecioPorTurno` toma el turno libre más bajo; en `Sorteo`/`Subasta` entra sin turno.

### Errores (rango 30–49; uso 30–39)

| Código | Nombre | Mensaje en la web |
| --- | --- | --- |
| 30 | `OpcionesInvalidas` | Revisa las opciones de turnos: algún valor está fuera de los límites. |
| 31 | `ModoNoPermite` | Esta tanda no usa ese mecanismo de turnos. |
| 32 | `TurnoInvalido` | Ese turno no existe en esta tanda. |
| 33 | `TurnoOcupado` | Alguien ya eligió ese turno. Elige otro. |
| 34 | `OfertaInvalida` | La oferta debe superar la mejor oferta actual sin pasar del máximo permitido. |
| 35 | `NoPuedeOfertar` | Solo puede ofertar quien todavía no tiene turno y está al día. |
| 36 | `SinSubasta` | En este momento no hay subasta abierta (la ronda ya venció o es la última). |
| 37 | `IntercambioInvalido` | Ese intercambio no es posible: los dos turnos deben ser futuros y ninguno puede estar en mora. |
| 38 | `PropuestaExistente` | Ya tienes una propuesta de intercambio abierta. Retírala antes de hacer otra. |
| 39 | `SinPropuesta` | No hay una propuesta de intercambio pendiente entre ustedes. |

### Eventos (bloque M3 de `eventos.rs`; todos con tópicos `[nombre, id]`, como los de hoy, para que la web los lea con el mismo filtro)

| Tópico | Datos | Frase en la web |
| --- | --- | --- |
| `opciones` | modo, permitir_intercambio, prima_max_bps, descuento_max_bps | "Turnos: precio por turno (el primero paga 10 %)" |
| `sorteo` | orden: Vec<Address> | "El contrato sorteó el orden: 1 Carla, 2 Ana, 3 Beto" |
| `oferta` | ronda, miembro, descuento_bps, descuento | "Beto ofrece recibir 8 % menos para cobrar en la ronda 2" |
| `subasta` | ronda, ganador, descuento, dividendo, por_respaldo | "Beto ganó la ronda 2 con 8 % de descuento: cada uno recibió 12 TUSD" |
| `prima` | ronda, miembro, prima (con signo) | "Ana pagó 24 TUSD por cobrar primero" / "Carla ganó 24 TUSD por esperar" |
| `garantia` | ronda, miembro, monto | "De la bolsa de Ana se apartaron 100 TUSD como su garantía" |
| `inter_prop` | de, con, compensacion | "Ana propone cambiar de turno con Beto" |
| `inter_ok` | de, con, turno_de, turno_con, compensacion | "Ana y Beto cambiaron de turno" |
| `inter_no` | de, con | "Se retiró la propuesta de Ana" |

### Cambios en archivos compartidos (avisados en el tablero)

- `lib.rs`
  - `crear_tanda`: **sin cambios** (`crear_tanda_avanzada` la llama tal cual, así hereda las validaciones de M1).
  - `unirse`: su cuerpo pasa a `unirse_en(env, id, miembro, turno: Option<u32>)` (no exportada, mismo bloque, misma sangría). Dentro, 4 líneas cambian: `turnos::posicion_al_unirse(..., turno)?`, `turnos::colateral_al_unirse(...)`, `turnos::al_unirse(...)` después de guardar y `turnos::al_llenarse(...)` al activar la tanda. Los ganchos de M2 quedan donde están.
  - `cerrar_ronda`: solo la regla 3. `beneficiario_de_ronda` pasa a `turnos::resolver_ronda(...)`, que devuelve el beneficiario y la bolsa ajustada (prima, descuento y dividendos), y dentro del pago se aparta la garantía con `turnos::completar_garantia(...)`. La regla 2, `deudas::anotar_ronda` y el calendario (M1) y `al_fin_operacion` (M2) no se tocan.
- `consultas.rs`: `colateral_siguiente` usa las nuevas puertas (mismo resultado para tandas sin opciones).
- `tipos.rs` / `eventos.rs`: solo bloques nuevos al final; errores 30–39 al final del enum.
- `ganchos.rs`: no lo toco.
- Web: una línea en `CrearTanda.tsx` (`OpcionesTurnos`) y una en `PanelRonda.tsx` (`AccionesTurnos`), más lo mínimo para que el botón de crear use `crear_tanda_avanzada` y el de unirse se oculte cuando hay que elegir turno.

---

## 3. La garantía: siempre la misma, cambia cuándo se deposita

La garantía de cada turno sigue siendo la de hoy: `colateral_i = max(cuota, cuota × (n − 1 − i) × cobertura)`. Así, quien cobra y desaparece no gana nada.

Hay dos momentos posibles para depositarla:

- **Al unirse** (llegada, elegir turno, precio por turno): el turno se conoce, así que se deposita completa, como hoy.
- **Al cobrar** (sorteo y subasta): al unirse todos dejan **una cuota** (la garantía del último turno). Cuando a alguien le toca cobrar, el contrato **aparta de su bolsa lo que le falta** para la garantía de su turno. Ese monto va a la bóveda y vuelve al final con rendimiento. Así funcionan los chit funds: quien gana el premio debe dejar garantía por las cuotas que aún debe.

Además, en toda tanda con opciones, si alguien llega a su turno con la garantía incompleta (porque cubrió un impago o porque adelantó su turno en un intercambio), se completa de la misma forma. En las tandas sin opciones no pasa nada de esto (paridad).

**Números** (cuota 100, cobertura 100 %, todos pagan):

| | Turno 1 | Turno 2 | Turno 3 |
| --- | --- | --- | --- |
| Garantía del turno | 200 | 100 | 100 |
| Llegada: deposita al unirse | 200 | 100 | 100 |
| Sorteo/subasta: deposita al unirse | 100 | 100 | 100 |
| Sorteo/subasta: se aparta al cobrar | 100 | 0 | 0 |
| Sorteo/subasta: recibe en efectivo al cobrar | 200 | 300 | 300 |

Con 12 personas (cuota 100, bolsa 1 200):

| Cobertura | Garantía del turno 1 | Se aparta al cobrar (turno 1) | Efectivo al cobrar (turno 1) | Garantía total del grupo |
| --- | --- | --- | --- | --- |
| 100 % | 1 100 | 1 000 | 200 | 6 700 |
| 50 % | 550 | 450 | 750 | 3 450 |
| 100 % con descuento Plata de M2 (25 %) | 825 | 725 | 475 | — |

La posición neta de cada persona es **idéntica** a la del orden de llegada: quien cobra primero en llegada deposita 1 100 al unirse y recibe 1 200; en sorteo deposita 100 y recibe 200 en efectivo. Lo que cambia es la liquidez: nadie tiene que tener 1 100 por adelantado.

**Alternativa ❓ (a):** que todos depositen la garantía máxima al unirse (1 100 cada uno con 12 personas: **13 200** inmovilizados en vez de 6 700) para que el primero reciba la bolsa completa en efectivo. **Recomiendo "al cobrar"**: pide 10 veces menos capital para entrar, no necesita devolver excesos (que multiplicaría las llamadas a la bóveda) y usa el mismo código en sorteo, subasta e intercambios. El costo, dicho con honestidad: con cobertura alta, quien gana la ronda 1 recibe poco efectivo. El historial de M2 (descuento de garantía) es justamente lo que lo mejora.

---

## 4. Los modos

### 4.1 Llegada (el de hoy)

Sin cambios. Con `crear_tanda_avanzada` + `Llegada` se puede además activar el intercambio.

### 4.2 Elegir turno (`Eleccion`) — la tarjeta "Intercambio" ❓

Cada quien elige un turno libre al unirse (`unirse_en_turno`), gratis, y ve la garantía de ese turno antes de firmar. Con `permitir_intercambio = true` es la tarjeta **"Elijan su turno y cámbienlo entre ustedes"**. Técnicamente es `PrecioPorTurno` con prima 0.

### 4.3 Precio por turno (`PrecioPorTurno`, modelo MoneyFellows)

- Al unirse cada quien **elige un turno libre** y ve su precio antes de firmar.
- **Prima de suma cero, lineal:** `prima_i = bolsa × prima_max × (n − 1 − 2i) / (n − 1)`. Positiva = paga (primeros turnos), negativa = recibe (últimos), cero en el medio si `n` es impar. Con redondeo hacia cero, `prima_i = −prima_(n−1−i)` exacto: la suma es **0** sin residuos.
- **Cuándo se mueve el dinero:** al cobrar. Al turno `i` se le **descuenta** su prima de la bolsa (va a `FondoPrimas`) o se le **suma** su bonificación desde ese fondo. Como las primas positivas siempre se cobran antes que las bonificaciones, el fondo nunca queda en negativo y termina en 0. No hay que cobrar nada extra al unirse ni tocar `finalizar`.
- Si la bolsa de un turno queda retenida (beneficiario moroso), la prima igual se aparta, así el fondo sigue cuadrando. Por seguridad, si al final quedara algo en el fondo, pasa al retenido que se reparte en `finalizar`.
- Ejemplo (3 personas, bolsa 300, prima máxima 8 %): turno 1 cobra **276** (paga 24), turno 2 cobra **300**, turno 3 cobra **324** (gana 24). Con 12 personas y 10 %: el turno 1 paga 120 y el 12 gana 120.
- Si dos quieren el mismo turno, gana quien firma primero (`TurnoOcupado` para el segundo, que ve los turnos libres actualizados).
- Extra (después del MVP): con M2, exigir un nivel mínimo para los primeros turnos, como MoneyFellows.

### 4.4 Sorteo verificable (`Sorteo`)

- Todos entran sin turno y dejan una cuota de garantía (§3). Cuando entra el último, el contrato **sortea el orden** con `env.prng().shuffle(...)` (Fisher-Yates del SDK 28), asigna los turnos y publica el evento `sorteo` con el orden.
- En esa transacción no se le paga a nadie: el orden queda guardado y se usa en las rondas siguientes (principio 4).
- **Limitación honesta** (documentación del SDK, `src/prng.rs`): la semilla sale del conjunto de transacciones del ledger. Ningún usuario puede elegirla, pero **un validador corrupto podría sesgarla**. Para tandas pequeñas en testnet es aceptable; se dice en la interfaz. Mejora futura: comprometer y revelar entre los miembros (`prng().seed(...)` permite mezclar sus secretos) o una VRF.
- Con `permitir_intercambio`, después del sorteo se pueden cambiar turnos.

### 4.5 Subasta por la bolsa (`Subasta`, modelo chit fund)

- Al llenarse la tanda, el contrato sortea un **orden de respaldo** (`Respaldo(id)`), visible desde el inicio.
- En cada ronda (menos la última), quien **aún no tiene turno y no está en mora** puede `ofertar` un descuento sobre la bolsa, **hasta que vence la ronda**. Cada oferta debe superar la mejor actual y no pasar de `descuento_max_bps`. Ofertas abiertas (se ven on-chain).
- Al cerrar la ronda:
  - Gana la mejor oferta (en empate, la más temprana: una oferta igual no se acepta). Si quien ofertó cayó en mora en esa misma ronda, la oferta no vale.
  - **Si nadie ofertó:** cobra el primero del orden de respaldo que todavía no tenga turno ❓. Es como un sorteo, pero hecho por adelantado, así todos saben desde antes a quién le toca si nadie oferta, y no rompe el principio 4.
  - Si todos los que faltan están en mora, el turno es del primero de ellos y su bolsa se retiene (igual que hoy).
  - El ganador recibe `bolsa − descuento`, y de ahí se aparta su garantía (§3).
  - El **descuento se reparte en partes iguales entre los demás miembros que no están en mora, como dividendo que se suma a su garantía.** Va a la bóveda en un solo depósito y vuelve en `finalizar` con rendimiento, sin cambiar `finalizar`. Además protege al grupo: si alguien deja de pagar, su dividendo cubre primero. El residuo del redondeo va al último que lo recibe; si nadie puede recibirlo, va al retenido.
- En la última ronda solo queda una persona: cobra la bolsa completa, sin subasta (`SinSubasta`).
- Ejemplo (3 personas, cuota 100, cobertura 100 %): en la ronda 1 Beto ofrece 5 % (15). Al cerrar, Beto recibe 300 − 15 = 285, de los que se apartan 100 de garantía → **185 en efectivo**. Ana y Carla reciben 7,5 cada una en su garantía.
- **Ofertas selladas** (comprometer y revelar) quedan como extra. Riesgo documentado de las abiertas: se puede mejorar una oferta en el último segundo (como en cualquier subasta abierta).

### 4.6 Intercambio de turnos (`permitir_intercambio`)

- Se activa en `Llegada`, `Eleccion`, `PrecioPorTurno` y `Sorteo` (en `Subasta` no hay turnos futuros que cambiar: `OpcionesInvalidas`).
- Dos pasos, porque cada transacción la firma una sola persona: `proponer_intercambio` (la firma `de`; si la compensación es positiva queda guardada en el contrato) y `aceptar_intercambio` (la firma `con`; si la compensación es negativa, `con` la paga en ese momento).
- Solo con la tanda `Activa`, entre dos miembros con turno asignado, **los dos turnos en el futuro** (`posicion > ronda_actual`) y ninguno en mora.
- **Garantía:** no se mueve al intercambiar. Quien adelanta su turno completa su garantía al cobrar (§3); quien lo atrasa conserva la que ya dejó y la recupera al final con rendimiento. Así el intercambio no necesita más llamadas a la bóveda y nunca deja a nadie sin cubrir.
- Con precio por turno, la prima va con el turno, no con la persona: la compensación es justamente cómo se ponen de acuerdo.
- Al cerrar cada ronda, las propuestas que ya no se pueden aceptar (un turno pasó o alguien cayó en mora) se retiran solas y la compensación guardada vuelve a quien la dejó. Así nunca queda dinero atrapado al terminar.

---

## 5. Seguridad, dinero y presupuesto

### 5.1 Conservación

Todo modo tiene una prueba de punta a punta con `assert_conservacion()` y `saldo(contrato) == 0` al final. Primas: suma exactamente cero. Dividendos: el residuo del redondeo no se pierde (último receptor o retenido). Compensaciones: guardadas en el contrato hasta aceptar o retirar, y las inválidas se devuelven solas.

### 5.2 Permisos

| Función | Firma |
| --- | --- |
| `crear_tanda_avanzada` | creador (la pide `crear_tanda`) |
| `unirse_en_turno` | miembro |
| `ofertar` | miembro que oferta |
| `proponer_intercambio` / `aceptar_intercambio` | `de` / `con` |
| `cancelar_propuesta` | `de` o `con` (el dinero siempre vuelve a `de`) |
| `cerrar_ronda` | nadie (como hoy) |

### 5.3 El azar y el *footprint*

Una transacción de Soroban declara antes de ejecutarse qué datos lee y escribe; la simulación del RPC los descubre ejecutándola con una semilla distinta de la real. Por eso:

- El sorteo del orden ocurre en el último `unirse` y solo escribe datos de **todos** los miembros (siempre los mismos): no depende del resultado.
- La subasta sin ofertas usa un orden sorteado **antes** (al llenarse). Al cerrar la ronda no hay azar: el ganador y su cuenta (la que recibe la transferencia) se conocen desde la simulación.
- Al cerrar una ronda de subasta se reescriben todos los miembros (dividendos), así el conjunto de datos no depende de quién gane.

### 5.4 Presupuesto (límites de testnet que midió ORQ)

Peores casos con 12 miembros que tendrán prueba y costo medido en el PR: el último `unirse` de un sorteo (barajar + 12 escrituras), `cerrar_ronda` de una subasta con dividendos para 11 personas (12 escrituras + un depósito), y `cerrar_ronda` de una tanda con prima y garantía apartada.

---

## 6. Web

- **Crear** (`OpcionesTurnos.tsx`, una línea en `CrearTanda.tsx`): cinco tarjetas en lenguaje simple:
  - "Por orden de llegada" (como siempre)
  - "Quien tiene prisa paga, quien espera gana" (precio por turno)
  - "Cada ronda gana quien acepte recibir menos" (subasta)
  - "El contrato sortea el orden" (sorteo)
  - "Elijan su turno y cámbienlo entre ustedes" (elegir + intercambio)

  Luego, los parámetros de cada modo y una vista previa por turno: garantía, cuándo se deposita, prima o bonificación y cuánto recibe.
- **Unirse:** rejilla de turnos libres con su precio (elegir y precio por turno); "El orden se sortea cuando se llene" (sorteo); "Dejas una cuota; el resto de tu garantía se aparta de tu bolsa cuando cobres" (sorteo y subasta).
- **En la tanda** (`AccionesTurnos.tsx`, una línea en `PanelRonda.tsx`): subasta (mejor oferta, campo para ofertar, cuenta regresiva y "si nadie oferta, cobra X"), intercambio (proponer y propuestas recibidas) y el resultado del sorteo.
- `Rueda.tsx` y `ListaMiembros.tsx`: "turno por sortear" o "por subastar" y el orden final.
- `historia.ts`: frases de los eventos nuevos. `contrato.ts`: mensajes 30–39. `e2e`: `mock.mjs` con `get_estado_turnos` y `cotizar_turno`, y un escenario por modo a 390 px.
- `scripts/demo_turnos.sh MODO=sorteo|precio|subasta|intercambio` para mostrar cada modo desde la terminal.

## 7. Pruebas (`contracts/tanda/src/test_turnos.rs`)

- **Paridad:** las 16 pruebas viejas sin tocarlas, más una que compara una tanda con `crear_tanda` contra `crear_tanda_avanzada(Llegada)` (mismos saldos finales).
- Por modo: tanda completa con `assert_conservacion()`, errores (turno ocupado o inválido, oferta baja, oferta sin turno o en mora, oferta en la última ronda, intercambio con alguien que ya cobró o está en mora, propuesta doble) y combinación con impagos y morosos (la subasta no le da la bolsa a un moroso; la garantía apartada cubre a quien cobra y desaparece).
- Sorteo: el resultado es una permutación válida y cambia con la semilla (`env.host().set_base_prng_seed`).
- Presupuesto: los tres peores casos de §5.4 con 12 miembros.

## 8. Decisiones (✅ DECIDIDO por @DocFranji, sáb 3 oct, 18:50 CR)

1. **Tarjeta "Intercambio"** = elegir turno gratis + intercambio. El intercambio también se puede activar en llegada, precio por turno y sorteo (en la subasta no hay turnos futuros que cambiar).
2. **Garantía en sorteo y subasta:** se completa al cobrar, apartándola de la bolsa (todos dejan 1 cuota al unirse). Ver §3 con números.
3. **Subasta sin ofertas:** cobra el siguiente de un orden de respaldo sorteado al llenarse, visible desde el inicio.
4. **Dividendo de la subasta:** se suma a la garantía de cada uno y vuelve al final con rendimiento.
5. **Límites:** prima máxima 20 % (MoneyFellows llega a 16 % de comisión y 20 % de bonificación); descuento máximo de subasta 50 %. En la web, por defecto 10 % y 30 %.

## 9. Implementación y cómo se probó

| Pieza | Archivos |
| --- | --- |
| Lógica de turnos (puertas, garantía al cobrar, primas, subasta, propuestas) | `contracts/tanda/src/turnos.rs` |
| Funciones públicas y consultas | `contracts/tanda/src/turnos_acciones.rs` |
| Tipos, errores 30–39 y eventos | bloques `// --- M3 ---` de `tipos.rs` y `eventos.rs` |
| Flujo principal | `lib.rs`: `unirse` → `unirse_en(..., turno)`; regla 3 de `cerrar_ronda`. `consultas.rs`: `colateral_siguiente` |
| Pruebas | `contracts/tanda/src/test_turnos.rs` (27) |
| Web | `web/src/lib/turnos.ts` (+ pruebas), `components/OpcionesTurnos.tsx`, `components/AccionesTurnos.tsx`, `historia.ts`, `contrato.ts`, `Rueda.tsx`, `ListaMiembros.tsx` |
| Navegador | `web/e2e/mock.mjs` (`nuevoEstadoTurnos()`), escenarios "Turnos" en `run.mjs` |
| Demo por terminal | `scripts/demo_turnos.sh` |

```bash
cargo test -p tanda test_turnos -- --nocapture   # 27 pruebas de M3
bash scripts/verificar.sh                        # toda la Definición de Terminado
MODO=subasta bash scripts/demo_turnos.sh         # un modo en testnet (después de desplegar_testnet.sh)
```

**Peor caso con 12 miembros, WASM real**, ya con M1 (deudas) y M2 (historial) dentro (`stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda peor_caso_turnos -- --nocapture`). Límites de mainnet, más estrictos que los de testnet: 100 M instrucciones, 100 lecturas y 50 escrituras.

| Operación | Instrucciones | Lecturas | Escrituras |
| --- | --- | --- | --- |
| Sorteo: último `unirse` (baraja y asigna 12 turnos) | 6,8 M | 46 | 22 |
| Sorteo: `cerrar_ronda` que aparta 1 000 de garantía | 5,3 M | 57 | 8 |
| Subasta: último `unirse` (sortea el orden de respaldo) | 4,4 M | 46 | 11 |
| Subasta: `ofertar` | 1,0 M | 8 | 2 |
| Subasta: `cerrar_ronda` con 6 impagos y dividendos para 11 | 20,7 M | 57 | 21 |
| Precio por turno: último `unirse_en_turno` | 4,5 M | 46 | 11 |
| Precio por turno: `cerrar_ronda` con prima | 4,2 M | 55 | 5 |
| `proponer_intercambio` / `aceptar_intercambio` | 1,3 M / 1,6 M | 12 | 4 / 7 |
| Subasta + deudas (M1): `cerrar_ronda` con casi nadie al día | 28,9 M | 57 | 30 |
| **Subasta + deudas (M1) + historial (M2): `cerrar_ronda` con casi nadie al día** | **38,7 M** | **72** | **42** |
| Subasta + historial (M2): `cerrar_ronda` con todos al día | 13,4 M | 61 | 23 |
| Subasta + historial (M2): `finalizar` con 12 que cumplieron | 19,8 M | 64 | **43** |

Todo cabe. Lo más justo son las escrituras (43 de 50): las pone el historial al anotar a las 12 personas en el `finalizar`, igual que en cualquier tanda de 12 con historial.

**Tamaño:** `tanda.wasm` pesa 73 171 bytes con M1 + M2 + M3 (límite de la red: 131 072). El historial es un contrato aparte (14 533 bytes).

### Cómo se combina con M1 (deudas) y M2 (historial)

- **M1:**
  - `deudas::anotar_ronda` recibe solo la bolsa retenida por mora (`if mb.moroso { bolsa } else { 0 }`).
  - Las claves de M3 viven lo mismo que la tanda (`renovar_para_tanda`) y se renuevan todas al llenarse y en cada cierre.
  - Lo que M3 aparta como garantía va a la bóveda de la tanda (`boveda_de`).
  - Al recuperar una bolsa retenida, M1 repone la garantía con las cuotas que faltan desde la ronda actual, no desde el turno. Esa regla sirve en todos los modos.
- **M2:** el descuento de garantía por historial (`ganchos::ajustar_colateral`) vale igual en todos los modos:
  - Al unirse: en sorteo y subasta se deja una cuota, que es el piso del descuento, así que ahí no cambia nada.
  - Al cobrar, en `completar_garantia`: se aparta lo que falta para la garantía del turno **con el descuento de ese momento**. Si el historial mejoró durante la tanda, se aparta menos; si empeoró, se aparta la diferencia; y nada se devuelve antes del final.
  - En `cotizar_turno` y en `colateral_para_miembro`, que usa `colateral_base_siguiente` (ACORDADO con M2): la web muestra la garantía real de entrada en cada modo.
  - El puntaje mínimo de la tanda (`puede_unirse`) se exige tanto en `unirse` como en `unirse_en_turno`.
  - **Web:** la nota del historial (`NotaHistorial`) también sale donde se elige turno. Al elegir una casilla, la explicación dice "(con el descuento de tu historial)" cuando la cotización es menor que la garantía normal.

**Validado en testnet** (sáb 3 oct, contratos desechables desplegados con `desplegar_testnet.sh` desde esta rama y `MODO=todos bash scripts/demo_turnos.sh`). Los cuatro modos corrieron de punta a punta, incluidos los pasos en los que el azar podría haber chocado con el *footprint*:

- Sorteo: el último `unirse` barajó y asignó los turnos ([tx](https://stellar.expert/explorer/testnet/tx/39263bdcc0806dc92a5ea6e20c07a8e49f2cb6c2658a82376f464d18e43ce066)). Al cobrar, se apartaron 100 de garantía de la bolsa del primero ([tx](https://stellar.expert/explorer/testnet/tx/b46714d6e34e3713066b5ccb6b2b3bba0d3c4ddeba2e43d67f4466b5ee05cc9e)).
- Precio por turno: el turno 1 pagó 24 y cobró 276 ([tx](https://stellar.expert/explorer/testnet/tx/b0a2aee290a5fb4026d1dd1bf748fcc4415d6b1460b78f849f3259d61caf3823)); el turno 3 cobró 324.
- Subasta: ganó la oferta de 10 %, los otros dos recibieron 15 de dividendo y el ganador cobró 170 en efectivo ([tx](https://stellar.expert/explorer/testnet/tx/21af6e4a988aa8ba408db8bdcb2b351f15c201a10c5da668bd3410e4c19caa62)). En la ronda sin ofertas cobró el primero del orden de respaldo.
- Intercambio: propuesta con 10 TUSD guardados y aceptación que cambió los turnos ([tx](https://stellar.expert/explorer/testnet/tx/a2790419bafe8c4485c9e2827f834a6352c8b35669c4617095c59564c2169072)).

**Firmas desde el cliente de la web, también en testnet.** Usé el cliente generado (`web/packages/tanda`) con el mismo camino que `clienteFirma` + `signAndSend`, firmando con llaves de prueba en vez de Freighter. Pasaron:
- `crear_tanda_avanzada`, con elegir + intercambio ([tx](https://stellar.expert/explorer/testnet/tx/f5bf30956868a87fecc492ab0a49249372f9258ca42e7c3cda769bfd5826bfd1)) y con subasta;
- `unirse_en_turno`;
- `proponer_intercambio`, con la compensación guardada ([tx](https://stellar.expert/explorer/testnet/tx/c27932331dafafdb0b54a2c8e89cbdbca8d9b62d262062b89fee6158cc64f45d));
- `aceptar_intercambio` ([tx](https://stellar.expert/explorer/testnet/tx/3ec566a2420054d545678019e41dd3a817db49858bdfae211cb6e4c99e4460b6));
- `ofertar` ([tx](https://stellar.expert/explorer/testnet/tx/01a079ceef400ba360a4b27095844628d5f6e42bce267bffa0db4b1d224988e3)).

Con esto quedan probadas la codificación de `OpcionesTanda` (el enum `modo`), las firmas anidadas (la compensación sale de quien firma) y la lectura de `get_estado_turnos` y `cotizar_turno`. Lo único que no se probó es la ventana de Freighter.
