# Revisión de seguridad y pruebas de invariantes

Revisión del orquestador (ORQ) sobre `integracion` con M1, M2 y M3 integrados (domingo 4 de octubre de 2026).
**Solo testnet**: esto no es una auditoría para dinero real.

## 1. Cómo se probó

### Pruebas de invariantes al azar (`contracts/tanda/src/test_invariantes.rs`)

Cada escenario arma un mundo nuevo, con su semilla:
- 6 a 15 personas;
- la bóveda principal y, a veces, la rápida (a veces casi sin fondos para intereses);
- a veces el historial, con puntajes previos, requisitos y descuentos.

Después juega cientos de operaciones al azar sobre hasta 3 tandas a la vez:
- tandas de 3 a 12 personas en los 5 modos de turnos, con rondas de 1 minuto a 90 días;
- pagos a tiempo, tarde y faltantes;
- deudas saldadas, completas o en partes, por el moroso o por otra persona;
- ofertas, intercambios y cancelaciones;
- subastas selladas: se sella y se revela, con sellos copiados, empates, revelaciones fuera de fase y con la sal o el monto equivocados (M3);
- tandas cuyos primeros turnos piden historial: al unirse, al llenarse y al intercambiar (M3);
- cierres muy atrasados;
- un historial que deja de aceptar hechos o se desconecta;
- y operaciones que deben fallar, revisando el código de error exacto.

**Después de cada operación** se revisa:

| # | Regla |
| --- | --- |
| 1 | No se crea ni se pierde dinero (suma de todos los saldos) |
| 2 | El contrato tiene en mano **exactamente** lo que debe: cuotas de la ronda, bolsas retenidas, multas, primas por repartir y compensaciones pendientes |
| 3 | Las participaciones anotadas por las tandas suman las que la bóveda reconoce. La bóveda puede pagarle a todos, y lo de cada tanda alcanza para su garantía (menos el redondeo) |
| 4 | Nada negativo. Deuda = suma de faltantes. Moroso ⇔ debe algo. Bolsas retenidas ⊆ `retenido`. Cada turno tiene un solo dueño, y nadie cobra antes de su turno |
| 5 | Nunca se traba: `cerrar_ronda` y `finalizar` funcionan siempre que corresponde, y al final no queda garantía ni participaciones |
| 6 | Operación por operación, cada quien paga o recibe lo que dicen las reglas: unirse (y lo que muestra la web antes de firmar), pagar cuota, cerrar ronda, pagar deuda, intercambios, cancelar y finalizar. En la subasta cobra quien debe: la mejor oferta (en la sellada, la mayor revelada; un empate lo decide el orden de respaldo) y, si no puede, el respaldo. En la sellada, la mitad que muestra la web y quiénes sellaron son los que espera el modelo |
| 7 | En la mitad de los escenarios (modo testnet): ningún dato de una tanda activa se archiva entre una operación y la siguiente |

Cómo correrlas:

```bash
cargo test -p tanda invariantes                                   # 8 escenarios (en CI, 32)
INVARIANTES_SEMILLAS=1000 cargo test -p tanda --release invariantes_al_azar
INVARIANTES_SEMILLA=123 cargo test -p tanda invariantes -- --nocapture   # repetir uno que falló
INVARIANTES_DETALLE=1 ... -- --nocapture                         # cuántas veces pasó cada cosa
```

**¿Las pruebas detectan errores de verdad?** Se metieron 6 errores a propósito en el contrato y las
pruebas atraparon 5:
- `finalizar` se queda con el resto del pozo;
- `pagar_deuda` no descuenta de `retenido` la bolsa que se recupera;
- el precio por turno guarda solo media prima;
- `cerrar_ronda` no anota el atraso de quien no pagó;
- `cancelar_propuesta` no devuelve la compensación.

La que no vieron (la subasta no reparte el resto de la división del descuento) es polvo que igual
termina repartido como rendimiento.

### Otras revisiones
- Lectura del código que mueve dinero de cada misión antes de integrarla (PR #6, #9 y #10).
- Peor caso con WASM real y 12 personas, medido contra los límites de mainnet.

## 2. Hallazgos

| # | Hallazgo | Gravedad | Estado |
| --- | --- | --- | --- |
| 1 | **`finalizar` podía trabarse.** El redondeo de las participaciones puede dejar un rendimiento de unas unidades mínimas negativo. Pasa con poco interés por depósito; por ejemplo, con la bóveda rápida "vieja", cuando una participación vale cientos de veces su precio inicial. Si además las multas le dejaban a quien cobra de último 1 unidad mínima de garantía, su pago salía negativo: no se transfería, a los demás se les pagaba completo y faltaba 1 unidad mínima. Sin dinero de otras tandas en el contrato, `finalizar` fallaba siempre. Con dinero de otras tandas, tomaba polvo ajeno. Reproducido con la bóveda rápida de 100 y de 140–150 días | Media (el monto es polvo, pero la tanda queda trabada) | **Arreglado** (ORQ, `lib.rs::finalizar`): se reparte en proporción lo que de verdad volvió, sin pagos negativos. Con rendimiento ≥ 0 da exactamente lo mismo que antes. Prueba: `finalizar_no_se_traba_con_rendimiento_negativo_por_redondeo` |
| 2 | El cliente compilado del historial (`web/packages/historial/dist/`) no estaba en el repo, por `web/.gitignore`. En un clon limpio (CI y Vercel) la web no compilaba | Alta para el despliegue | **Arreglado** (`e53145f`). `verificar.sh` ahora lo comprueba |
| 3 | `ClaveM2::Requisitos(id)` solo se renueva al configurarse. En tandas de más de ~150 días puede archivarse mientras la tanda sigue. Desde el protocolo 23 se restaura sola al leerse (cuesta un poco más); la leen `get_requisitos` y, en tandas con turnos, `completar_garantia` | Baja | **Arreglado** (M2, `ganchos.rs`): se renueva con la vida de la tanda en cada cierre de ronda y al unirse alguien. Prueba: `los_requisitos_viven_lo_que_dure_la_tanda` (3 rondas de 90 días). **Todavía no está en la red:** la tanda v3 (`CADFZ…BYMC`) se desplegó antes; entra en el próximo despliegue de la tanda |
| 4 | Sorteo: la semilla de `env.prng()` no la elige ningún usuario, pero un validador podría sesgarla | Baja en testnet | Documentado en `docs/turnos.md` §4.4 y en la interfaz |
| 5 | Margen de escrituras por transacción: el peor caso usa **43 de 50** (finalizar con 12 cumplidos e historial) | Atención | Cada función nueva en `cerrar_ronda` o `finalizar` debe medirse con `PEOR_CASO_WASM=1` |
| 6 | **Límite de eventos por transacción (16 384 B).** Con USDC de Blend, el cierre de una ronda en la que 11 personas caen en mora a la vez emitía 16 600 B de eventos (historial 6 952, tanda 4 808, USDC 2 640, Blend 2 200). La simulación no revisa ese límite: la web armaba la transacción, la red la rechazaba con `resource_limit_exceeded` y reintentar daba lo mismo, así que la tanda quedaba trabada. Con TUSD el peor caso ya estaba al 86 % | Alta (la tanda queda trabada para siempre) | **Arreglado** (M4, `lib.rs::cerrar_ronda`): lo que cubren las garantías se saca de la bóveda una sola vez por cierre. Peor caso con Blend real en testnet: 12 204 B. Las pruebas de peor caso (`test_deudas.rs`, `test_historial.rs`, `test_turnos.rs`) ahora exigen `contract_events_size_bytes <= 16 384` |
| 7 | **v5: eventos del reparto de garantías.** El primer diseño emitía un evento por (moroso, afectado): con 11 morosos, `finalizar` llegó a 20 108 B de eventos (límite 16 384 B), lo que habría trabado la tanda en la red aunque la simulación pasara | Alta (la tanda queda trabada) | **Arreglado** antes de integrar (M1, `deudas::repartir_garantias`): un evento por moroso y solo 24 partes detalladas por transacción. La prueba de peor caso ya exige `contract_events_size_bytes <= 16 384` |
| 8 | **v5: `finalizar` reparte la garantía de los morosos.** Mueve dinero nuevo en la función más cara (peor caso 28,3 M de instrucciones, 31 escrituras con 11 morosos). Si todos terminan en mora, lo que no tiene a quién repartirse queda sin repartir en el contrato, como ya pasaba con las bolsas retenidas | Atención | Cubierto por invariantes al azar (400 semillas) con el reparto calculado aparte, y por el peor caso en WASM |
| 9 | **`finalizar` se trababa si la bóveda perdía valor y había multas pendientes** (existía desde antes; lo expuso la prueba de pérdida en Blend al adaptarla a la v5). Las multas se cobraban de una garantía anotada sin dinero detrás, se repartían de más y la transferencia fallaba | Media (tanda trabada en un caso raro) | **Arreglado** (M1, `lib.rs::finalizar`): el déficit lo absorbe el fondo de multas. Prueba: `arreglado_perdida_en_blend_se_cubre_con_lo_que_hay` |

## 3. Permisos (quién puede hacer qué)

| Función | Firma que pide |
| --- | --- |
| `inicializar`, `configurar_boveda_rapida`, `configurar_historial` | admin (`inicializar`, una sola vez) |
| `crear_tanda`, `crear_tanda_avanzada`, `cancelar` (solo abierta), `configurar_requisitos` (solo abierta y vacía) | creador |
| `unirse`, `unirse_en_turno`, `pagar_cuota`, `ofertar`, `ofertar_sellada`, `revelar_oferta` | el miembro |
| `pagar_deuda` | quien paga (puede ser otra persona) |
| `proponer_intercambio` / `aceptar_intercambio` | quien propone / quien acepta |
| `cancelar_propuesta` | quien propuso o a quien se le propuso |
| `cerrar_ronda`, `finalizar` | **nadie**, a propósito: cualquiera puede destrabar una tanda vencida |
| `marcar_verificado` | el verificador, si existe |
| Historial: `registrar_lote` | solo emisores autorizados por su admin. No se puede borrar ni editar |

## 4. Supuestos de confianza
- **Admin de la tanda:** elige la bóveda principal, la rápida y el historial para las tandas **nuevas**. Cada tanda guarda su bóveda al crearse, y cambiarla nunca mueve dinero de tandas que ya existen.
- **Bóveda:** la simulada nunca promete más de lo que tiene (tope de solvencia) y su precio nunca baja. Con Blend (M4), el riesgo de la bóveda es el de Blend.
- **Historial:** un historial que falla no traba ninguna operación (todas las llamadas usan `try_`). Las excepciones son unirse a una tanda que pide puntaje mínimo y tomar un turno que pide historial (también por intercambio): ahí falla cerrado. Un historial malicioso podría gastar el presupuesto de la transacción; por eso solo lo configura el admin.
- **Ofertas selladas:** el sello esconde el monto, no quién selló. La sal la guarda el navegador de quien sella: si la pierde, no puede revelar y su oferta no cuenta, pero no pierde dinero, porque sellar no deposita nada.
- **Token:** `crear_tanda` acepta cualquier dirección de token. Una tanda con un token que no corresponde a su bóveda no llega a arrancar, porque el depósito en la bóveda falla al unirse. Con M4, el registro de bóveda por token lo rechaza antes, con el error 55.

## 5. Antes de pensar en dinero real (fuera del alcance del hackathon)
- Auditoría externa de los contratos y del adaptador de Blend.
- Un sorteo con compromiso y revelación entre los miembros, o una VRF, en vez de `env.prng()`.
- Límites a la cuota y a los montos (hoy solo se exige que sean mayores que 0; un desbordamiento hace fallar la transacción, porque `overflow-checks = true`).
- Correr las pruebas de invariantes con miles de semillas en cada versión, y sumar a esas pruebas cada función nueva (las ofertas selladas y los turnos con historial ya están).
