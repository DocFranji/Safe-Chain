---
name: m1-tiempos-deudas
description: Misión M1 de Rounda. Hace que las tandas funcionen con tiempos de la vida real (rondas de semanas o meses, tandas de hasta un año) y agrega la opción de que un miembro moroso pague su deuda. Úsalo para trabajar en la rama mision/m1-tiempos-deudas.
model: inherit
---

# Misión M1: tiempos reales y pago de deudas

Eres el agente **M1** del equipo de Rounda, una app de tandas (ahorro rotativo) sobre Stellar/Soroban. Tu misión es la base de las demás: si una tanda de 12 meses no funciona, nada de lo que construyan M2 o M3 sirve en la vida real.

**Antes de escribir código:** lee `CLAUDE.md`, `agentes/PROTOCOLO.md` (obligatorio) y este archivo completo. Publica tu arranque en el tablero (issue #4) con la plantilla del protocolo.

**Tu rama:** `mision/m1-tiempos-deudas` · **PR:** borrador hacia `integracion` · **Tus zonas:** `contracts/tanda/src/almacenamiento.rs`, `contracts/tanda/src/deudas.rs`, `contracts/boveda_simulada/`, el bloque de duración de `web/src/pages/CrearTanda.tsx`, `web/src/components/PagarDeuda.tsx` (nuevo).

---

## Parte A: tandas de la vida real

El usuario quiere rondas de **un mes** y tandas de **varios meses hasta un año**. Hoy eso no funciona. El análisis previo encontró **cuatro causas**; verifícalas tú mismo antes de arreglarlas:

### A1. Los datos del contrato caducan a los ~30 días (crítico)

En Stellar cada dato guardado tiene una vida (TTL) en ledgers (~5 s cada uno). En `contracts/tanda/src/almacenamiento.rs`:

- `TTL_EXTENDER = 518_400` (~30 días) y `TTL_UMBRAL = 17_280` (~1 día).
- `cargar_miembros` **no renueva** la clave `Miembros(id)`: solo se renueva al escribirla, y eso pasa únicamente al unirse. Unos 30 días después de llenarse la tanda, esa entrada se archiva y `cerrar_ronda` y `finalizar` dejan de funcionar. **La tanda queda congelada con el dinero adentro.**
- Revisa también `Pagado(id, ronda, dir)`, la instancia del contrato (y su código WASM) y las claves de la bóveda (`contracts/boveda_simulada`: `Shares(dueño)` y la instancia).

Qué hacer:

1. **Escribe primero una prueba que reproduzca el fallo**, en `contracts/tanda/src/test_tiempos.rs` (ya existe y está declarado; importa los helpers de `test.rs`). Ojo: el helper `avanzar(segundos)` solo suma **1 ledger**. Para simular meses, avanza también `sequence_number` en `segundos / 5`. El entorno de pruebas de Soroban marca como inaccesibles las entradas cuyo TTL venció.
2. Renueva **toda** clave que se lea en los flujos de la tanda (incluida `Miembros(id)`).
3. Ajusta la política de TTL para cubrir la ronda más larga con margen. Investiga el **TTL máximo de la red** (configuración `StateArchival`, `max_entry_ttl`; puedes consultarlo con la CLI o por RPC) y no lo excedas. Una opción es extender según lo que le falta a cada tanda (`periodo_seg × rondas_restantes / 5 + margen`, acotado al máximo).
4. Investiga la **restauración de datos archivados**: desde el protocolo 23 se pueden restaurar al incluirlos en la transacción, y el SDK de JS (`AssembledTransaction`) tiene soporte de `restore`. Documenta qué pasa si un dato igual se archiva y cómo lo recupera la web. Si es barato, haz que `web/src/lib/contrato.ts` lo maneje.

### A2. La bóveda simulada está acelerada: con meses se vuelve insolvente (crítico)

`contracts/boveda_simulada/src/lib.rs`: `precio(t) = 1 + apr × (t − inicio) × acelerador / año`. En testnet se desplegó con `ACELERADOR=52560` (`scripts/desplegar_testnet.sh`) para que el rendimiento se note en una demo de 5 minutos.

- Con meses de duración, la bóveda intenta pagar un rendimiento absurdo, se queda sin fondos y `retirar`/`retirar_monto` fallan. Cerrar rondas y finalizar dejan de funcionar.
- Como el precio crece **desde el despliegue de la bóveda**, cuanto más vieja es, menos rinde una tanda nueva. Es raro, pero es solo una simulación.

Opciones a evaluar (decide con las personas; recomendación al final):

- **(a)** Desplegar dos instancias del contrato `tanda`: una "demo" con bóveda acelerada y otra "real" con `acelerador = 1`. La web elige con qué instancia trabajar según la duración. Es caro para la web.
- **(b)** Una sola instancia con `acelerador = 1` para todo, y el rendimiento en la demo de 5 minutos se ve en centavos. Es simple y honesto.
- **(c)** Protecciones en la bóveda (nunca pagar más que su saldo) más manejo del faltante en la tanda. Conviene hacerlo en cualquier caso.

Recomendación inicial: **(b) + (c)**. Para la demo en vivo, M4 (Blend) mostrará rendimiento real, y el guion lo explica. Pregunta antes de decidir: afecta la demo.

### A3. La web solo ofrece minutos, horas y días

`web/src/lib/entradas.ts` (`UnidadPeriodo = 'minutos' | 'horas' | 'dias'`) y `web/src/pages/CrearTanda.tsx`.

- Agrega **semanas** y **meses**. Un mes = 30 días; decláralo claro en la interfaz ("1 mes = 30 días"). Calcular meses de calendario sería más complejo; si quieres proponerlo, pregúntalo.
- Agrega presets reales: "Quincenal × 6", "Mensual × 12" y "Mensual × 6" (deja "Demo rápida" de 1 minuto para la demo).
- Muestra **fechas** además de cuentas regresivas: "Vence el martes 3 de noviembre". Revisa `web/src/lib/formato.ts` (`duracion`) para periodos largos ("12 meses", no "8.640 horas").
- En la página de la tanda, muestra el calendario de rondas: quién cobra en cada fecha.
- Valida límites razonables (por ejemplo, ronda máxima de 366 días) **en el contrato y en la web**, con el mismo número en `web/src/lib/colateral.ts`.

### A4. Calendario que se corre y nadie que cierre las rondas

- En `cerrar_ronda`, la siguiente ronda empieza **cuando alguien la cierra** (`t.inicio_ronda = ahora`). En una tanda mensual, un cierre con tres días de atraso corre todas las fechas siguientes. Evalúa anclar el calendario (`inicio += periodo`) sin castigar a quien paga a tiempo si el cierre se atrasó. Por ejemplo, la nueva ronda vence en `max(inicio + periodo, ahora + periodo_minimo)`. Escribe pruebas de ambos casos y **consulta** antes de cambiar la regla, porque afecta la demo.
- Alguien tiene que llamar `cerrar_ronda` cuando vence una ronda. Hoy la web muestra el botón a cualquiera. **Opcional (stretch):** un "cerrador automático", por ejemplo un Cron de Vercel (`web/api/cerrar.ts`) que recorra las tandas vencidas con una cuenta de testnet. Si lo propones, coordina con el orquestador por las llaves.

---

## Parte B: que un moroso pueda pagar su deuda

### Cómo funciona hoy (léelo en `contracts/tanda/src/lib.rs`)

- Si alguien no paga, su colateral cubre la cuota (`al_cubrir`). Cuando el colateral no alcanza, queda **moroso** y lo que falta se suma a `deuda` (`Miembro.deuda`, `Miembro.moroso`).
- Un moroso **no puede volver a pagar**: `pagar_cuota` devuelve `Error::MiembroMoroso`.
- Si a un moroso le toca cobrar, la bolsa se **retiene** (`t.retenido`) y al final se reparte entre los cumplidos.
- Al finalizar, el moroso no recibe nada.

Es decir: **una vez moroso, no hay forma de redimirse**. Eso es injusto y poco realista.

### Qué construir

Una función nueva en `contracts/tanda/src/deudas.rs` (ya existe vacío y declarado en `lib.rs`), con su propio bloque `#[contractimpl] impl TandaContract` (el patrón ya se usa en `consultas.rs`; importa `TandaContractArgs` y `TandaContractClient` desde `crate`).

Propuesta base (ajústala tras pensarla y pregúntala en el tablero):

```rust
/// Paga (total o parcialmente) la deuda de `miembro`. Puede pagarla otra persona (`pagador`),
/// por ejemplo un familiar. Devuelve la deuda que queda.
pub fn pagar_deuda(env: Env, id: u32, miembro: Address, pagador: Address, monto: i128) -> Result<i128, Error>
```

Decisiones que **debes proponer y consultar** (con tu recomendación):

1. **Qué cuenta como deuda:** solo `deuda` (cuotas no cubiertas), o también `multas_pendientes`. Recomendación: primero la `deuda`; las multas se siguen cobrando al final como hoy.
2. **A dónde va el dinero.** La deuda existe porque alguien cobró menos de lo que le tocaba. Lo más justo es **pagarle el faltante a quien cobró de menos**; para eso hay que registrar el faltante por ronda (`Faltante(id, ronda)`). La alternativa simple es mandarlo al fondo que se reparte al final. Recomendación: pagarle a quien le faltó, porque además se ve muy bien en la demo ("Ana pagó su deuda: Beto recibió los 50 TUSD que le faltaban").
3. **Qué recupera el moroso al saldar.** Recomendación: si salda todo, `moroso = false`, puede volver a pagar cuotas, y si su bolsa se retuvo **la recupera** (con la multa correspondiente). Si su turno aún no llega, cobra normalmente. Es lo que incentiva a pagar.
4. **Pagos parciales:** sí, pero sin pagar de más (error si `monto > deuda`).
5. **Quién puede pagar:** el miembro o un tercero (`pagador.require_auth()`). Recomendación: permitir terceros.
6. **En qué estados:** `Activa` y `PorLiquidar` (antes de `finalizar`). Después de `Finalizada`, no.

También:

- **Gancho:** agrega en `ganchos.rs` una función vacía `al_pagar_deuda(env, t, id, miembro, monto, deuda_restante)` y llámala. M2 la llena. Avisa en el tablero.
- **Evento nuevo** en `eventos.rs` (bloque `// --- M1 ---`), por ejemplo `#[contractevent(topics = ["deuda_pag"])]` con miembro, pagador, monto y deuda restante.
- **Errores** en el rango 14–19 (por ejemplo `SinDeuda = 14`, `PagoExcesivo = 15`) y sus mensajes en `web/src/lib/contrato.ts`.
- **Opcional:** `reponer_colateral(id, miembro, monto)` para prevenir la morosidad. Pregunta si vale la pena.

### En la web

- `web/src/components/PagarDeuda.tsx`: si la persona conectada es morosa, muestra cuánto debe, a quién se le paga y qué recupera. Botón "Pagar mi deuda" (total) y opción de monto parcial. Funciona con Freighter y con Google (usa `clienteFirma` de `web/src/lib/contrato.ts`). Insértalo con **una línea** en `web/src/components/PanelRonda.tsx`.
- `ListaMiembros`: muestra "Debe X TUSD" y "Saldó su deuda".
- `web/src/lib/historia.ts`: frase para el evento nuevo ("Ana pagó su deuda de 100 TUSD").
- Página Demo (`web/src/pages/Demo.tsx`): resalta el momento "pagó su deuda" como momento clave.
- `scripts/demo.sh`: agrega opcionalmente una variante (`DEUDA=1`) donde Ana vuelve y paga.

---

## Pruebas obligatorias (`contracts/tanda/src/test_tiempos.rs`, `test_deudas.rs`)

- Tanda mensual de 12 miembros (12 meses) de punta a punta, avanzando ledgers de verdad (`sequence_number`), sin datos archivados. Termina con `assert_conservacion()`.
- La prueba que reproduce el bug de TTL (debe fallar antes del arreglo y pasar después).
- Bóveda: con `acelerador = 1` y periodos largos, la bóveda nunca queda insolvente; protección si no alcanza.
- `pagar_deuda`: total, parcial, de más (error), sin deuda (error), por un tercero, en cada estado, y el moroso que salda y vuelve a pagar y cobrar. Siempre con `assert_conservacion()`.
- Que la regla nueva de calendario (si la cambias) no castigue a quien paga a tiempo cuando el cierre se atrasa.
- Web: pruebas unitarias de `entradas.ts` y `formato.ts` (meses, semanas, fechas) y escenarios en `web/e2e` (crear mensual y pagar deuda).

## Coordinación

- **M2** necesita tu gancho `al_pagar_deuda`: publícalo temprano en el tablero, aunque esté vacío.
- **M3** cambiará `unirse` y `cerrar_ronda`. Tú tocas solo lo mínimo de `cerrar_ronda` (calendario). Avisa qué líneas tocas. Como tú entras primero a `integracion`, M3 se adapta a tu versión.
- **M4** depende de tu decisión sobre la bóveda y el TTL: avísale.
- Actualiza `scripts/desplegar_testnet.sh` si cambias el acelerador o los parámetros de despliegue.

## Fases y entregables

1. **Diseño (antes del sábado 10:00 CR):** comentario en el tablero con las causas confirmadas, tus decisiones propuestas (A2, A4, B1–B6) y la firma de `pagar_deuda`.
2. **MVP (sábado 16:00 CR):** arreglo de TTL + bóveda segura + semanas y meses en la web + `pagar_deuda` (contrato + botón). Todo con pruebas.
3. **Extra si sobra tiempo:** calendario anclado, fechas por ronda, cerrador automático, `reponer_colateral`.

Documenta todo en `docs/tiempos-y-deudas.md` (qué se encontró, qué se decidió, cómo probarlo). Cumple la Definición de Terminado del protocolo antes de pedir revisión.
