# Misión M1: tiempos reales y pago de deudas

Rama `mision/m1-tiempos-deudas` · Tablero: issue #4 · Instrucciones: `.claude/agents/m1-tiempos-deudas.md`.

Objetivo: que una tanda de **rondas mensuales y hasta 12 meses** funcione de verdad en testnet, y que un **moroso pueda pagar su deuda** y volver a estar al día.

Estado: **MVP implementado** (dom 4 oct). Las decisiones marcadas con ❓ se llevaron a las personas en el resumen de ORQ (issue #4). Se implementó la recomendación de cada una, y todas son reversibles hasta el despliegue v2. Lo que quedó fuera del MVP está en §5.

---

## 1. Lo que encontramos (causas confirmadas)

Datos de testnet usados (ORQ y medición propia, 3 oct): protocolo **29**; **5,0 s por ledger** (ledgers 4 990 000 → 5 009 000 en 95 000 s); vida máxima de un dato (`maxEntryTTL`) **3 110 400 ledgers ≈ 180 días**; vida mínima de un dato persistente nuevo **120 960 ledgers ≈ 7 días**.

### A1. Los datos de la tanda se archivan (crítico) ✅ confirmado

Prueba: `test_tiempos::tanda_mensual_de_12_meses_sin_datos_archivados` (12 personas, rondas de 30 días). Revisa la vida de cada dato **antes** de cada salto de tiempo. Antes del arreglo fallaba así:

```
mientras se llena: Miembro(1, #0) se archivaría (le quedan 17279 ledgers y vamos a avanzar 17280)
```

Causas, de mayor a menor gravedad:

1. **En testnet los datos viven ~7 días, no 30.** Un dato nuevo nace con la vida mínima de la red (7 días). `extender` solo renueva si le queda **menos de 1 día** (`TTL_UMBRAL`), así que un dato que nadie toca en su último día se archiva a los 7 días. Ejemplo: Ana se une el día 0 y la tanda tarda 7 días en llenarse: su registro se archiva antes de que arranque.
2. **`Miembros(id)` nunca se renueva al leerse** (`cargar_miembros`). Solo se escribe al unirse.
3. **`Pagado(id, ronda, dir)` debe vivir toda la ronda** (30 días en una tanda mensual) y hoy vive 7.
4. **La bóveda** (`Shares(dueño)` y su instancia) solo se toca cuando alguien no paga y al final. En una tanda donde todos pagan, pasa meses sin tocarse.
5. La **instancia** del contrato y su código WASM siguen la misma política.

**Qué pasa hoy en la red si algo se archiva.** Desde el protocolo 23 (CAP-66), un dato archivado **no se pierde**: la simulación del RPC lo marca para "restauración automática" y la transacción lo restaura al usarlo, pagando una tarifa extra. Si hay demasiado que restaurar para una sola transacción, el RPC devuelve un `restorePreamble` y hay que enviar antes una operación `RestoreFootprint`; el SDK de JS lo hace solo con la opción `restore: true` (pide una firma más). Sin esa opción, la web muestra el error "restore some contract state" (ya traducido en `contrato.ts`). Conclusión: la tanda no queda congelada para siempre, pero cada operación de una tanda larga pagaría restauraciones y la experiencia se vuelve frágil. Por eso el arreglo sigue siendo necesario.

> Ojo para las pruebas: desde el SDK 23, leer un dato archivado en las pruebas **no falla** (se restaura solo, como en la red). Por eso las pruebas de M1 revisan la vida (`get_ttl`) de cada dato antes de cada salto de tiempo, en vez de esperar un error.

### A2. La bóveda acelerada se vuelve insolvente con meses (crítico) ✅ confirmado

Prueba: `test_tiempos::boveda_acelerada_con_meses_no_traba_la_tanda` (3 personas, rondas de 30 días, bóveda ×52 560). Antes del arreglo, `finalizar` fallaba:

```
"balance is not sufficient to spend" … transfer … 2596000000000   (la bóveda debía 259 600 TUSD y tenía 10 400)
```

Con `ACELERADOR=52560`, **1 minuto real = 36,5 días simulados** y **1 mes real ≈ 4 320 años** de intereses. La tanda queda trabada con la garantía adentro.

Hallazgo extra que afecta la demo de hoy: el precio crece **desde que se desplegó la bóveda**, así que una bóveda vieja rinde cada vez menos. La bóveda de producción (`CCUX…F45F`) ya tiene precio **20,9** (desplegada hace 2,8 días). El lunes a las 16:00 andará por **34**: la demo de 6 minutos mostrará ~0,35 TUSD de rendimiento en vez de ~12 TUSD.

### A3. La web solo ofrece minutos, horas y días ✅ confirmado

`UnidadPeriodo = 'minutos' | 'horas' | 'dias'`; `duracion()` muestra "360 días" en vez de "12 meses"; `CrearTanda` avisa que más de 25 días "no se ha probado"; no hay fechas ("vence el martes 3 de noviembre"), solo cuentas regresivas.

### A4. El calendario se corre ✅ confirmado (lectura del código)

`cerrar_ronda` hace `t.inicio_ronda = ahora`: si en una tanda mensual cada ronda se cierra 3 días tarde, la ronda 12 vence 33 días después de lo previsto. Y nadie cierra las rondas solo: depende de que alguien toque el botón.

---

## 2. Decisiones

### A1. Política de vida de los datos (`almacenamiento.rs`)

- **Vida según lo que le falta a la tanda:** `vida_tanda(t) = (fin estimado − ahora) / 5 s + margen de 30 días`, con **tope en el máximo de la red** (`env.storage().max_ttl()`, hoy ~180 días; no se escribe a mano).
  - `Abierta`: fin = ahora + n × periodo (como si arrancara ya).
  - `Activa`: fin = vencimiento de la última ronda.
  - `PorLiquidar`, `Finalizada`, `Cancelada`: solo el margen (30 días). Después de terminada, la tanda puede archivarse: su historia de largo plazo vive en el historial de M2.
- **`guardar_tanda` renueva TODO lo de la tanda** (tanda, lista de miembros, cada miembro, registros de deuda, bóveda de la tanda) y la instancia. Toda operación que cambia una tanda termina en `guardar_tanda`, así que nadie tiene que acordarse de renovar. `pagar_cuota` renueva el pago hasta el vencimiento de la ronda + margen.
- **Piso al leer:** `cargar_*` (incluida `cargar_miembros`) renueva a 31 días si le queda menos de 30. Arregla el caso "nadie toca este dato".
- **Instancia y código:** al máximo de la red, renovando como mucho una vez al día. La tanda también renueva la instancia y el código **de su bóveda** (`env.deployer().extend_ttl`, no necesita permiso).
- **Bóveda:** renueva su instancia y las participaciones de quien llama al máximo de la red en cada llamada.
- **Ronda máxima: 90 días** (3 meses), en el contrato (`MAX_PERIODO_SEG`) y en la web (`colateral.ts`). ❓ Las instrucciones sugerían 366; propongo 90 porque una ronda debe caber holgada en la vida máxima de un dato (180 días) más el margen. Cubre semanal, quincenal, mensual, bimestral y trimestral.
- **Red de seguridad en la web:** `restore: true` en `clienteFirma`, para el caso raro en que el RPC pida una restauración aparte.
- Límite conocido: si en una tanda de más de 6 meses **nadie** deja de pagar ni se une a ninguna tanda del contrato en 180 días, las participaciones del contrato en la bóveda podrían archivarse; se restauran solas (con tarifa) al finalizar. No se pierde dinero.

### A2. Bóveda ❓ (afecta la demo: decide @DocFranji)

**En cualquier caso (implementado): protección de solvencia.** El precio de la bóveda nunca supera `saldo / participaciones`. Con eso se puede demostrar que (1) la bóveda **siempre** puede pagarle a todos (nunca queda insolvente, `retirar` nunca falla por falta de fondos) y (2) el precio **nunca baja**, así que nadie pierde lo que depositó. Si se agota el fondeo, el rendimiento simplemente se detiene.

Opciones:

- **(B) Una sola bóveda sin acelerar** (`acelerador = 1`, 5 % anual real). Simple y honesto. En la demo de 6 minutos el rendimiento es invisible (~0,0002 TUSD); depende de que M4 muestre rendimiento real con Blend.
- **(D) Dos bóvedas en el mismo contrato** (recomendada): una **rápida** (acelerada, solo para tandas de prueba con rondas de **10 minutos o menos**) y una **real** (5 % anual, sin acelerar) para todo lo demás. Cada tanda guarda su bóveda al recibir el primer depósito, así que el admin puede **cambiar la bóveda rápida por una nueva antes de la presentación** (para que rinda lo máximo) sin afectar las tandas que ya existen. La web sigue con un solo contrato; solo dice "rendimiento acelerado de demostración" o "rendimiento simulado: 5 % anual".
- (a) Dos instancias del contrato de tanda: descartada (cara para la web).

Recomiendo **(D)**: conserva el momento "tu garantía genera rendimiento" de la demo y es honesta con las tandas reales. El código soporta las dos: (B) es simplemente no configurar la bóveda rápida y desplegar la principal con `acelerador = 1`.

### A3. Web

- Unidades **semanas** y **meses** ("1 mes = 30 días", dicho en la interfaz).
- Ejemplos: Demo rápida (1 min × 3), Semanal × 4, Quincenal × 6, Mensual × 6, Mensual × 12.
- `duracion()`: "12 meses", "6 semanas", "45 días". Fechas: "vence el martes 3 de noviembre".
- Calendario de la tanda: quién cobra en cada fecha (componente propio `Calendario.tsx`, una línea en `PaginaTanda.tsx`).
- Mismo límite de ronda (90 días) en la web y en el contrato.

### A4. Calendario anclado ❓ (reversible; avanzo con la recomendación)

Regla nueva al cerrar una ronda:

```
vence_siguiente = max(vence_anterior + periodo,  ahora + min(periodo, 3 días))
```

- Con rondas de hasta 3 días (incluida la demo de 1 minuto) da **exactamente lo mismo que hoy**: la demo no cambia.
- En tandas semanales o mensuales, las fechas quedan fijas (cada 7 o 30 días) aunque se cierre tarde.
- Si el cierre se atrasa muchísimo, la ronda siguiente igual da **al menos 3 días** para pagar: nadie queda "tarde" por culpa de un cierre atrasado.

**Cerrador automático** (extra, después del MVP): un Cron de Vercel (`web/api/cerrar.ts`) que cierre rondas vencidas y finalice tandas. Necesita una cuenta de testnet con XLM (sin permisos especiales: `cerrar_ronda` y `finalizar` no piden firma). Lo coordino con ORQ si sobra tiempo.

### B. Pagar la deuda

**Firma:**

```rust
/// Paga (todo o una parte) la deuda de `miembro`. Puede pagarla otra persona (`pagador`).
/// Devuelve la deuda que queda.
pub fn pagar_deuda(env: Env, id: u32, miembro: Address, pagador: Address, monto: i128) -> Result<i128, Error>

/// Deuda de un miembro: a quién le debe y su bolsa retenida (si tiene).
pub fn get_deuda(env: Env, id: u32, miembro: Address) -> Result<Deuda, Error>
```

| # | Decisión | Propuesta |
| --- | --- | --- |
| B1 | Qué cuenta como deuda | Solo `deuda` (cuotas que la garantía no alcanzó a cubrir). Las multas siguen como hoy; si recupera una bolsa retenida, de ahí se descuentan sus multas pendientes |
| B2 | A dónde va el dinero | **A quien cobró de menos.** Al cerrar cada ronda se anota el faltante de cada moroso con su acreedor (el que cobró esa ronda). El pago se reparte del faltante más viejo al más nuevo. Si la bolsa de esa ronda se retuvo (el que cobraba también era moroso), el pago se suma a esa bolsa retenida |
| B3 | Qué recupera al saldar | `moroso = false`; puede volver a pagar cuotas; si su turno no ha llegado, cobra normal; si su bolsa se retuvo, **la recupera menos sus multas pendientes** (que van al fondo de premios). Sus atrasos quedan: no recibe el premio de "sin atrasos" |
| B4 | Pagos parciales | Sí. Error si `monto > deuda` (`PagoExcesivo`) o `monto <= 0` (`MontoInvalido`) |
| B5 | Quién paga | El miembro o cualquier otra persona (`pagador.require_auth()`; el dinero sale del pagador) |
| B6 | En qué estados | `Activa` y `PorLiquidar`. En otro estado: `EstadoInvalido` |

Momento de la demo: *"Ana pagó su deuda de 100 TUSD: Carla recibió los 100 TUSD que le faltaban."*

**Datos nuevos** (enum propio `ClaveM1`, no toco `DataKey`): `Deuda(id, miembro)` con la lista de faltantes `{ronda, acreedor, monto}` y la bolsa retenida; `BovedaTanda(id)`; `BovedaRapida` (instancia).

**Errores:** 14 `SinDeuda`, 15 `PagoExcesivo`, 16 `MontoInvalido` (17–19 quedan reservados para M1).

**Eventos:** `deuda_pag` (miembro, pagador, monto, deuda restante), `abono` (deudor, acreedor, ronda, monto: "Carla recibió 100 TUSD que le faltaban de la ronda 3") y `bolsa_rec` (miembro, monto, multas).

**Gancho para M2:** `ganchos::al_pagar_deuda(env, t, id, miembro, monto, deuda_restante)`, vacío.

**`reponer_colateral`** (opcional): no entra al MVP. Lo propongo como extra si sobra tiempo.

---

## 3. Cambios en archivos compartidos (avisados en el tablero)

- `lib.rs`:
  - `crear_tanda`: rechaza `periodo_seg > MAX_PERIODO_SEG`.
  - `cerrar_ronda`:
    - en la regla 2 anota el faltante del moroso;
    - después de pagar o retener la bolsa, una llamada `deudas::anotar_ronda(...)`;
    - la línea del calendario (`t.inicio_ronda = tiempos::inicio_siguiente(&t, ahora)`).
  - Todos los usos de la bóveda pasan por `boveda_de(&env, id, &t)` en vez de `direccion_boveda(&env)`.
  - `mod tiempos; // M1`.
- `tipos.rs` / `eventos.rs`: bloque `// --- M1 ---` al final, y errores 14–16 al final del enum `Error`.
- `ganchos.rs`: solo agrego `al_pagar_deuda` vacío.
- `web/src/components/PanelRonda.tsx`: una línea para `PagarDeuda`. `PaginaTanda.tsx`: una línea para `Calendario`.

### Ajustes durante la implementación

- **`sacar_de_boveda`** (hallazgo de M4, decisión de ORQ). Cuando la tanda cubre un impago, nunca gasta participaciones de otra tanda del mismo contrato. Si la bóveda vale menos de lo anotado, entra lo que de verdad salió: esa diferencia es pérdida de la bóveda, no deuda del moroso.
- **Tolerancia de redondeo en la bóveda.** Con la bóveda sin acelerar, el precio sube una unidad mínima cada ~63 s. Si nadie pagaba la primera ronda, sacar las garantías completas pedía 1 unidad más de las que había y **la tanda se trababa**. Ahora la bóveda pone esa fracción, hasta 100 unidades mínimas, que son centésimas de centavo.
- **Garantía al recuperar la bolsa a mitad de tanda** (pedido de M3 y ORQ). Si el moroso salda mientras la tanda sigue, de su bolsa retenida primero se repone la garantía para las cuotas que aún debe, con la misma fórmula que al unirse y un mínimo de una cuota. Esa garantía vuelve al final con rendimiento. Así no puede cobrar y volver a desaparecer. M3 engancha ahí `turnos::completar_garantia` para sus modos.
- **Renovación de la bóveda.** La tanda renueva la instancia y el código de su bóveda (`deployer().extend_ttl`, sin permiso) y llama con `try` a una función opcional `renovar(dueño)` que renueva las participaciones del contrato. Una bóveda sin esa función, como el adaptador de Blend, no rompe nada.
- **Consultas extra:**
  - `get_deudas(id)`: todas las deudas de la tanda en una sola llamada; la web la usa para "Saldó su deuda".
  - `acelerador()` en la bóveda: la web dice si el rendimiento es acelerado o real.
- **Errores de la bóveda:** pasan a 17 y 18. Antes eran 1 y 2, y la web los confundía con los de la tanda; por ejemplo, decía "Esa tanda no existe".
- **Sin `///` en los errores 14–16:** el SDK de JS usaría ese texto como mensaje en vez del nombre.

## 4. Cómo probarlo

```bash
bash scripts/verificar.sh                    # toda la Definición de Terminado (de ORQ)
cargo test -p tanda test_tiempos             # TTL, calendario, ronda máxima, bóvedas
cargo test -p tanda test_deudas              # pagar_deuda en todos sus casos, con conservación
stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda peor_caso -- --nocapture   # costo con WASM real
cd web && npm test                           # entradas, formato y fechas, deudas, historia
DEUDA=1 bash scripts/demo.sh                 # en testnet, después de desplegar_testnet.sh
```

### Pruebas que importan

| Prueba | Qué demuestra |
| --- | --- |
| `tanda_mensual_de_12_meses_sin_datos_archivados` | 12 personas, rondas de 30 días, 12 meses avanzando ledgers de verdad con los límites de testnet. Antes de cada salto revisa que ningún dato de la tanda ni de la bóveda se archive. Antes del arreglo fallaba |
| `boveda_acelerada_con_meses_no_traba_la_tanda` | Con ×52 560 y meses, `finalizar` ya no falla. Antes fallaba |
| `boveda_*` | El precio nunca baja, la bóveda nunca promete más de lo que tiene (también casi sin fondeo y con depósitos y retiros alternados), y sin acelerar rinde 5 % en un año |
| `una_tanda_no_se_traba_por_redondeo_de_la_boveda` | Antes fallaba con `Error(Contract, #2)` |
| `una_tanda_nunca_gasta_participaciones_de_otra` | El hallazgo de M4. Antes fallaba |
| `calendario_*`, `cierre_atrasado_no_castiga_a_quien_paga_a_tiempo` | Con rondas cortas, igual que antes; con mensuales, las fechas no se corren; y quedan al menos 3 días para pagar |
| `test_deudas::*` | Pago total, parcial, de más, sin deuda, por un tercero, sin firma, en cada estado, moroso que vuelve a pagar y cobrar, bolsa retenida, acreedor moroso y garantía repuesta. Todas con conservación |
| `peor_caso_12_miembros_con_morosos` | Cada operación medida contra los límites de mainnet |

### Peor caso medido (12 miembros, contratos en WASM)

| Operación | Instrucciones | Lecturas | Escrituras |
| --- | --- | --- | --- |
| `cerrar_ronda` | 22,2 M | 48 | 28 |
| `pagar_deuda` | 6,2 M | 37 | 16 |
| `finalizar` | 6,7 M | 34 | 15 |
| `unirse` (el último, que activa) | 3,7 M | 39 | 10 |
| `pagar_cuota` | 1,1 M | 10 | 4 |

Límites por transacción: en mainnet, 100 M instrucciones, 100 lecturas y 50 escrituras; en testnet, 400 M y 200 entradas. Tamaño de los WASM: `tanda.wasm` 41,6 KB y `boveda_simulada.wasm` 10,4 KB (el límite es 128 KB).

## 5. Pendiente y riesgos

- **Cerrador automático** (Cron de Vercel) y **`reponer_colateral`**: no entraron al MVP.
- **Segundos por ledger:** la vida de los datos se calcula a 5 s por ledger (lo medido). Si la red se acelera, los datos viven menos en días. Sigue habiendo margen, porque cada cierre renueva todo y la ronda más larga (90 días) más el margen (30 días) cabe holgada en el máximo (~180 días). Si algo se archiva igual, se restaura solo (protocolo 23+).
- **Participaciones en la bóveda de una tanda tranquila:** se renuevan en cada cierre con `renovar`. Una bóveda que no tenga esa función (el adaptador de Blend) depende de que haya movimiento, o de la restauración automática.
- **Multas de un moroso que salda antes de su turno:** como no le queda garantía, sus multas pendientes no se cobran al final; solo se descuentan si recupera una bolsa retenida. El historial de M2 registra igual que estuvo en mora.
- **Eventos:** el RPC público guarda eventos solo unos días. La historia de una tanda de meses en la web queda incompleta; los datos del contrato (`get_*`) sí están completos.

## 6. Despliegue (v2)

- `scripts/desplegar_testnet.sh` despliega dos bóvedas: la principal, con `ACELERADOR=1`, y la rápida, con `ACELERADOR_RAPIDA=52560`. Luego configura la rápida en la tanda. Con `SIN_BOVEDA_RAPIDA=1`, todo usa la principal (opción A de la decisión de la bóveda).
- Antes de la presentación: `bash scripts/renovar_boveda_rapida.sh` cambia la rápida por una nueva, sin afectar las tandas que ya existen.
- La web no necesita variables nuevas: lee la bóveda de cada tanda del contrato (`get_boveda`).
