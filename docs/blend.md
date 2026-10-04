# Blend real (M4): auditoría del adaptador y recomendación

**Fase 0 de la misión M4** · sáb 3 oct 2026 · rama `mision/m4-blend` (PR #8)

Revisé el adaptador que ya existe (rama `blend-adaptador`, commit `b5f17e4`), lo comparé línea por
línea con el código de Blend v2 (`blend-capital/blend-contracts-v2`, commit `ba22b48`), consulté
el pool TestnetV2 por RPC y lo volví a probar en testnet con XLM **y con el USDC de prueba de Blend**.

## Resumen

- **El adaptador está bien hecho.** Cada dueño tiene su cuenta exacta de bTokens y el redondeo
  nunca le quita bTokens a otro dueño. Le hice cuatro mejoras de robustez (sección 1.3) y le
  escribí 13 pruebas nuevas con un pool simulado que se porta como Blend v2.
- **Hay dos hallazgos importantes, y los dos están en la TANDA, no en el adaptador** (sección 1.4):
  una tanda puede gastar bTokens de otra tanda del mismo contrato y dejarla trabada para siempre.
  Pasa si el precio de la bóveda no sube (reserva de Blend sin préstamos, pérdida en Blend, o la
  bóveda simulada con el precio topado que propone M1). El arreglo es corto: lo propongo en la sección 5.
- **Novedad: sí se puede conseguir USDC de prueba de Blend.** Blend tiene un faucet público que en
  una sola transacción crea las trustlines y entrega 1 000 USDC. Lo probé y una tanda en USDC
  completa funcionó en testnet. Una tanda en **dólares** con rendimiento **real** es la mejor historia.
- **Liquidez:** hoy el pool tiene 9,5 M XLM y 28 k USDC libres; nuestras tandas mueven decenas.
  Si un día no hay liquidez, la tanda **se atrasa, no pierde dinero**: cualquiera reintenta después.
- **Recomendación de producto:** opción (b), un solo contrato con una bóveda por token:
  **TUSD → bóveda simulada** (rendimiento acelerado para la demo) y **USDC → Blend** (rendimiento
  real). XLM queda como alternativa. Encaja con el modelo que ya acordaron M1 y ORQ (cada tanda
  guarda su bóveda al crearse).

## 1. Hallazgos

| # | Pregunta | Resultado | Severidad | Prueba |
| --- | --- | --- | --- | --- |
| 1.1 | ¿Un retiro puede quemar bTokens de otro dueño del adaptador? | **No.** Descartado matemáticamente y con 120 operaciones aleatorias | — | `redondeo_de_retirar_nunca_quema_de_mas`, `dos_duenios_operaciones_aleatorias_nunca_se_cruzan` |
| 1.2 | ¿`valor()` está desactualizado? | **No.** `get_reserve` de Blend v2 calcula el interés hasta el ledger actual | — | `valor_coincide_con_lo_que_paga_retirar` |
| 1.3 | Robustez del adaptador | 4 mejoras aplicadas (quema medida, retiro recortado, menos llamadas, errores 50–53) | Media | `si_blend_quemara_de_mas_se_revierte`, `retiro_recortado_por_blend_se_detecta` |
| 1.4a | ¿Una TANDA puede gastar bTokens de otra tanda del mismo contrato? | **Sí** (con precio fijo): la otra tanda no puede finalizar nunca | **Alta** | `hallazgo_una_tanda_puede_gastar_btokens_de_otra` |
| 1.4b | ¿Una pérdida en Blend traba la tanda? | **Sí:** `cerrar_ronda` falla hasta que paguen los morosos | Media (raro) | `hallazgo_perdida_en_blend_traba_cerrar_ronda` |
| 2 | Liquidez (pool muy prestado) | La tanda se traba y se destraba sola; sin pérdida | Media | `sin_liquidez_la_tanda_se_traba_y_se_destraba` |
| 3 | Pool congelado | No se puede **unirse**; las tandas en curso terminan bien | Baja | `pool_congelado_bloquea_unirse_pero_no_retirar` |
| 4 | TTL | Igual que M1: renovar al máximo de la red. Nada se pierde (se restaura) | Media | (ver M1) |
| 5 | Permisos | Correctos: nadie mueve lo de otro | — | `nadie_mueve_lo_de_otro_sin_su_firma` |
| 6 | Costo del peor caso (12 retiros de Blend en un `cerrar_ronda`) | Medido en testnet (sección 3) | — | `peor_caso_12_miembros_nadie_paga` + testnet |

### 1.1 Redondeo entre dueños del adaptador: descartado

El adaptador hace lo mismo que Blend:

- **Depositar:** Blend acuña `floor(monto / b_rate)` bTokens. El adaptador **mide** cuántos
  acuñó (posición antes y después) y se los anota al dueño.
- **`retirar_monto(monto)`:** Blend quema `ceil(monto / b_rate)`. El adaptador mide cuántos
  quemó y se los descuenta al dueño (si no le alcanzan, se revierte todo).
- **`retirar(shares)`:** el adaptador pide `monto = floor(shares × b_rate)`, y Blend quema
  `ceil(monto / b_rate)`. Como `monto ≤ shares × b_rate`, se cumple `ceil(monto / b_rate) ≤ shares`:
  **nunca se quema más de lo que se descuenta.** Lo que sobra (a lo más 1 bToken por retiro) queda
  como "polvo" del adaptador, que no es de nadie.

Esto solo vale si el `b_rate` que lee el adaptador es el mismo con el que Blend quema. En Blend v2
lo es: `get_reserve` y `submit` usan `Reserve::load`, que es determinista para el mismo ledger.

**Invariante:** la suma de las participaciones de todos los dueños ≤ bTokens del adaptador en Blend.
La prueba `dos_duenios_operaciones_aleatorias_nunca_se_cruzan` lo revisa después de cada una de
120 operaciones con montos y tiempos raros; al final, los dos dueños salen con todo y quedan 0 bTokens.

### 1.2 `valor()` no está desactualizado

`get_reserve` de Blend v2 (`pool/src/contract.rs`) llama `Reserve::load`, que **acumula el interés
hasta el ledger actual** antes de devolver la reserva (no lo guarda, pero lo calcula). Por eso:

- `valor(shares)` es exactamente lo que pagaría `retirar(shares)` en ese mismo ledger (prueba
  `valor_coincide_con_lo_que_paga_retirar`, con 6 horas sin que nadie toque la reserva).
- `finalizar` no usa `valor()`: usa lo que `retirar` devuelve de verdad. No hay riesgo.
- La web (`Rendimiento.tsx`) simula `valor()` contra el último ledger: muestra el número correcto.

### 1.3 Mejoras aplicadas al adaptador (`contracts/adaptador_blend/src/lib.rs`)

1. **Retiro recortado por Blend.** Blend **no falla** si se pide más de lo que hay: recorta el
   retiro a todos los bTokens del usuario y entrega menos (`apply_withdraw` en `actions.rs`).
   Antes, el adaptador lo aceptaba y la tanda creía haber recibido el monto completo. Ahora, si el
   adaptador quedó en 0, comprueba que lo entregado alcanzó; si no, error 51 y se revierte todo.
2. **Quema medida en `retirar`.** Defensa en profundidad: mide los bTokens quemados y, si fueran
   más que los descontados (no pasa en Blend v2), error 53 `QuemaInesperada` y se revierte.
3. **Menos llamadas a Blend.** El índice de la reserva se lee una vez al desplegar (el constructor
   además valida que el token sea una reserva del pool) y se usan las posiciones que devuelve
   `submit`. `retirar_monto` pasó de 5 llamadas a Blend a 2.
4. **Errores en el rango de M4 (50–53).** Los errores del adaptador llegan tal cual a quien firma
   la transacción de la tanda; con los códigos viejos (1, 2, 3) la web los confundía con errores de
   la tanda ("ya inicializado", "no encontrada"). Ver la tabla de códigos en la sección 6.

El pool simulado de las pruebas (`test.rs`) ahora se porta como Blend v2: mismos códigos de error,
recorte al retirar, utilización < 100 % al retirar, pool congelado, reserva deshabilitada, tope de
depósitos, acuñar 0 bTokens falla, y pérdidas por deuda incobrable (el `b_rate` baja).

### 1.4 Hallazgos en la tanda

**a) Una tanda puede gastar bTokens de otra tanda del mismo contrato (severidad alta).**

El adaptador lleva la cuenta **por dueño**, y el dueño es el **contrato** de la tanda: todas las
tandas de ese contrato comparten una sola cuenta. La separación entre tandas la hace la tanda con
`t.shares_boveda`, pero `cerrar_ronda` hace

```rust
let quemadas = boveda.retirar_monto(&yo, &cubierto);
t.shares_boveda -= quemadas; // sin revisar que alcancen
```

Cada depósito redondea hacia abajo y cada retiro hacia arriba. Si se consume **todo** el colateral
de una tanda (rondas sin pagar) y el precio no subió lo suficiente para tapar esos redondeos, la
tanda termina con participaciones **negativas**: gastó bTokens de otra tanda. La otra tanda luego
no puede finalizar (`SharesInsuficientes`) y queda trabada **para siempre**.

La prueba `hallazgo_una_tanda_puede_gastar_btokens_de_otra` lo reproduce: tanda A con 3 miembros que
no pagan y cuota de 10,0000001; termina con `shares_boveda = -3` y la tanda B ya no puede finalizar.

¿Cuándo pasa de verdad? Cuando el precio de la bóveda queda **fijo** o **baja**:
- una reserva de Blend sin préstamos (utilización 0: Blend no acumula interés);
- una pérdida en Blend (ver b);
- **la bóveda simulada con el precio topado que propone M1** (`saldo / participaciones`): si se
  acaba el fondeo, el precio se detiene y aparece este mismo cruce. **Afecta también a TUSD.**

Con interés normal no pasa: la prueba `con_interes_el_mismo_escenario_termina_bien` corre el mismo
escenario con el `b_rate` subiendo y termina bien. Por eso la demo actual no lo ha mostrado.

**b) Una pérdida en Blend traba `cerrar_ronda` (severidad media, poco probable).**

En Blend v2 el `b_rate` **puede bajar**: si el backstop no alcanza a cubrir una deuda incobrable,
`default_liabilities` (`pool/src/pool/user.rs`) la reparte entre los depositantes. Entonces el
colateral anotado vale menos de lo que dice la tanda. La prueba
`hallazgo_perdida_en_blend_traba_cerrar_ronda` lo muestra: con una pérdida del 50 %, cubrir tres
cuotas impagas falla y la ronda no avanza hasta que los morosos paguen. Si nunca pagan, la tanda
queda trabada. (Si hubiera otra tanda en el mismo contrato, en vez de fallar le gastaría sus bTokens.)

**Arreglo propuesto para a) y b): sección 5.**

## 2. Liquidez, estado del pool y TTL

### 2.1 Liquidez

Un retiro de Blend falla con el error **1207** (`InvalidUtilRate`) si deja la reserva al 100 % de
utilización (`apply_withdraw` llama `require_utilization_below_100`). No importa el `max_util` del
95 %: ese límite es solo para pedir prestado.

Medido por RPC el sáb 3 oct (ledger 5 009 543):

| Reserva | Depositado | Prestado | Utilización | Libre para retirar |
| --- | --- | --- | --- | --- |
| XLM | 116,5 M | 107,0 M | 91,8 % | **9,5 M XLM** |
| USDC (prueba de Blend) | 130 354 | 101 901 | 78,2 % | **28 453 USDC** |

Una tanda de la demo mueve 40 unidades; una de 12 personas con cuota de 100, unas 6 700. El riesgo
real para el hackathon es muy bajo.

**Qué pasa si falta liquidez** (prueba `sin_liquidez_la_tanda_se_traba_y_se_destraba`):
- `cerrar_ronda` con impagos y `finalizar` fallan con 1207 y se **revierten**: no se pierde nada.
- Mientras tanto, los miembros todavía pueden pagar tarde; si todos pagan, la ronda cierra sin tocar Blend.
- Cuando vuelve la liquidez, **cualquiera** reintenta y todo termina bien. En Blend, una utilización
  alta dispara la tasa de interés (curva `r_three`), lo que empuja a los prestatarios a devolver.
- La tanda trabada sigue "corriendo el reloj" del TTL: por eso la renovación de M1 (al máximo de la
  red en cada operación) importa también aquí. Y nada se pierde aunque se archive: se restaura.

**Mitigaciones evaluadas:**
- **A) Sin colchón + error claro + reintento (recomiendo para el hackathon).** Mensaje en la web para
  1207: "Blend no tiene liquidez en este momento. Tu dinero está seguro; intenta en unos minutos."
- **B) Colchón en el adaptador** (un % del colateral fuera de Blend). Exige convertir el adaptador en
  una bóveda con participaciones propias (estilo ERC-4626): más código y más riesgo de redondeo. Para
  producción, no para el domingo.
- **C) Cubrir con lo que haya.** Es parte del arreglo de la sección 5 para pérdidas; para liquidez
  no ayuda (el retiro mismo es lo que falla).

### 2.2 Estado del pool

Blend v2 (`Pool::require_action_allowed`, `Reserve::require_action_allowed` y `apply_supply`):

| Situación | Depositar (unirse) | Retirar (cerrar ronda, finalizar, cancelar) |
| --- | --- | --- |
| Activo (estado 0–1) | sí | sí |
| "On ice" (2–3): solo bloquea pedir prestado | sí | sí |
| **Congelado (4–5)** o en configuración (6) | **no (error 1206)** | **sí** |
| Reserva deshabilitada | **no (1223)** | sí |
| Tope de depósitos lleno | **no (1220)** | sí |

Con el pool congelado nadie puede **unirse** a una tanda en Blend, pero las tandas en curso cierran
sus rondas y terminan bien (prueba `pool_congelado_bloquea_unirse_pero_no_retirar`). El dinero
nunca queda atrapado por el estado del pool, solo por falta de liquidez (2.1). La web debe explicar
1206, 1220 y 1223 ("Blend no está aceptando depósitos ahora").

Otros riesgos externos: si Blend reinicia su despliegue de testnet, el pool viejo sigue existiendo
(los contratos no se borran) y las tandas en curso pueden terminar; las nuevas usarían el pool nuevo.

### 2.3 TTL

El adaptador renueva hoy a ~30 días, y como explica M1, en testnet un dato nuevo nace con 7 días y
solo se renueva si le queda menos de 1 día. Lo que vive en Blend no es problema: el pool lo usa todo
el mundo (instancia ~31 días, reservas ~46 días) y la posición del adaptador se renueva a ~120 días
en cada operación nuestra.

**Política (ACORDADA con M1):** instancia y cuenta de cada dueño al máximo de la red (`max_ttl()`)
en cada llamada, renovando a lo más una vez al día. La tanda además renueva la instancia y el código
de su bóveda (M1). Lo aplico en la fase 2, sobre la rama de M1 ya integrada, para usar la misma
función. Desde el protocolo 23, un dato archivado no se pierde: la transacción lo restaura.

### 2.4 Permisos

| Función | Quién firma | Qué puede hacer otro |
| --- | --- | --- |
| `depositar(desde, monto)` | `desde` | Nada: sin la firma de `desde` falla, aunque `desde` haya dado permiso de gasto al adaptador |
| `retirar(hacia, shares)` / `retirar_monto(hacia, monto)` | `hacia` | Nada: solo se gastan las participaciones de `hacia` y el dinero va a `hacia` |
| `valor`, `shares_de` | nadie (lectura) | — |
| Constructor | quien despliega | Fija pool y token para siempre: **no hay admin** ni forma de cambiarlos |

Sin admin no hay llave que pueda vaciar el adaptador; la contracara es que no hay forma de "rescatar"
el polvo de redondeo (centavos de centavo) ni de migrar a otro pool. Es lo correcto para este caso.
Blend no permite depositar a nombre de otro (`from` debe firmar) ni transferir bTokens, así que
nadie puede inflar o mover la posición del adaptador. Prueba: `nadie_mueve_lo_de_otro_sin_su_firma`.

## 3. Validación en testnet (3 oct 2026)

Identidades propias desechables, XLM de Friendbot y USDC del faucet de Blend. Pool TestnetV2
`CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`.

Contratos desplegados desde esta rama (desechables, no oficiales):

| Qué | Dirección |
| --- | --- |
| Adaptador XLM | `CDGSGYHBEYKEYATVVKZ66BLRBKPZELSDNR35RJVTOCDEPH6L42QEKFG2` |
| Tanda XLM | `CDAQ7S2WZ2RPXV3NYHCPD7WBQSHQO647OMYJIMAPKUA5TDBMCBRZQR5F` |
| Adaptador USDC | `CAHCWYLGQOJW7NPCKIKSZY6MEGQWD3EZE27VJVIJLKEGZ4VX5ZK63JZ7` |
| Tanda USDC | `CD5JSW5Z5TTCINR4DCKSUTOKJNGEPR32YEY3KXFRPK7YRL3RDFHYYAYE` |
| Tanda del peor caso (12 miembros, usa el adaptador XLM) | `CCZNLSV5WP2PXJBJMLLAUXK4RA2DDE3PZLSYYE7N6SGD3OBL4EKOWOMB` |

El despliegue del adaptador ya prueba el constructor nuevo: lee `get_reserve` del pool real
(XLM: `b586f5f0cebc7218d5e1cb0084f267d72777a6344ba72df619bee8d0cb7c6e25`).

**Demo completa en XLM** (`scripts/demo_blend.sh`: cuota 10 XLM, Ana cobra y desaparece, Beto paga tarde):

| Paso | Transacción |
| --- | --- |
| Ana se une: 20 XLM de colateral entran a Blend | `0665f3dfe39854309372295d7bca27a5005247d0758fe593037ffeb5b67f7629` |
| Ronda 2: Ana no paga; su colateral **sale de Blend** y cubre su cuota | `60ed27bdeff4da0850869940fa04c81cd558967f6b3a5bb0f507454123ceae2a` |
| Ronda 3: otra vez cubre el colateral de Ana; Beto paga tarde | `67550d33ac992b142bdab8bc58681e0234a62f1d886373c8fe29e0c21763ba8b` |
| Finalizar: se retira todo de Blend y se reparte | `05598a2df9b335b0165c71f7a80a855c85cad0bab00f63a49a7becc1fd323b7c` |

Resultado (evento `finalizada`): **rendimiento real 0,0008984 XLM** en ~8 minutos. Beto recibió
9,0004255 XLM (10 − 1 de multa + rendimiento) y Carla 11,0004729 XLM (10 + 1 de premio + rendimiento).
La tanda quedó en 0.

**Demo completa en USDC de Blend** (mismo guion; cuentas fondeadas con el faucet de Blend:
`0879be0499898f3d1da8bd459de14494cefde73b6517111230ed43a046697c14`,
`34828c2d3c07bc7f15beebef224d6d9ebe667b98f5a2183d241e0b2d562e66cc`,
`cb2663b72c8d81dd250caf1cb06bcd26a361db27053fde3cba433ff6f138d015`):

| Paso | Transacción |
| --- | --- |
| Ana se une: 20 USDC de colateral entran a Blend | `acc2bf48c6788eb588f26aca4128f4afdff7e162b99b8efab978621d1e91b677` |
| Ronda 2: el colateral de Ana sale de Blend y cubre su cuota | `8c02cdf802fbf540321c52c57a2320d377fffa1cfe397c9c84c301cc7e3c947d` |
| Ronda 3: otra vez cubre el colateral de Ana; Beto paga tarde | `fe82461057de405fc000031213a80c56d849ace2fd4c6d5037db12c19031cb61` |
| Finalizar: se retira todo de Blend y se reparte | `766169656ef99fe0332f6f5ec3829497ad20175cbd4f2703ee0e44f62b835f47` |

El guion muestra el rendimiento real en cada ronda: "+0,0000039 USDC", "+0,0000077", "+0,0000108".
Resultado: **rendimiento real 0,0000108 USDC**; Ana terminó con sus 1 000 USDC iniciales (cobró 30 y
perdió su garantía: huir no le dio nada), Beto con 999,0000051 (multa de 1) y Carla con 1 001,0000057
(premio de 1). La tanda quedó en 0. Saldos exactos: con USDC no hay comisiones que los ensucien.


**Peor caso: 12 miembros que no pagan** (`cerrar_ronda` con 12 retiros reales de Blend), recursos
leídos de la red:

| Transacción | Instrucciones | Entradas leídas / escritas | Bytes escritos | Comisión |
| --- | --- | --- | --- | --- |
| `unirse` (1 depósito en Blend) · `49a3d4f7ab71aaf468aa7fd539fbe7f9970d4a1943bf899473743babeb58eb58` | 5,3 M | 22 / 12 | 3 368 | 0,086 XLM (primera vez: crea datos) |
| `cerrar_ronda` con **12 retiros** · `00d0bc4906ca3b12320131e7bade92f550c8d5bdb59c9f6e3e06408733e560be` | **39,0 M** | 42 / 19 | 6 988 | 0,014 XLM |
| `cerrar_ronda` con 11 retiros · `15ba51799e6f3c4199ac865cb7a826a9833fda7b7e21d6626d2f73a358267c85` | 33,6 M | 42 / 19 | 6 988 | 0,013 XLM |

Límites de testnet (dato de ORQ): 400 M instrucciones, 200 entradas. El peor caso usa **~10 %** de
las instrucciones y 21 % de las entradas: queda espacio de sobra para los ganchos del historial (M2).
Cada retiro de Blend suma ~5 M instrucciones (39,0 M con 12 retiros contra 33,6 M con 11).

<!-- FINALIZAR12 -->

**Rendimiento real medido** (dos lecturas del `b_rate` con 1 075 s de diferencia):
- XLM: **≈ 179 % anual** (el pool está prestado al 92 %: tasas de testnet, no de mainnet). 40 XLM de
  colateral ganan ≈ 0,0007 XLM en 5 minutos.
- USDC de Blend: **≈ 2,2 % anual**. 40 USDC ganan ≈ 0,000004 USDC en 3 minutos.

Es real y es pequeño. Hay que contarlo con honestidad: "+0,0007 XLM en 5 minutos, de verdad, en Blend".
La bóveda simulada sigue siendo la que muestra un rendimiento grande (acelerado) en la demo.

## 4. Conseguir USDC de prueba (faucet de Blend)

La web de Blend (`blend-ui`, `contexts/wallet.tsx`) usa este faucet público:

```
GET https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets?userId=<G...>
```

Devuelve (como texto JSON) una transacción **ya firmada por el emisor**
`GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56` con 8 operaciones: crea las trustlines
y entrega **1 000 USDC**, 5 000 BLND, 0,5 wETH y 0,05 wBTC. La cuenta solo agrega su firma y la envía.

- Probado: hash `9a51909089eea911ebc397680252e89086e22ed1932fbcbe6b7d52a728962a2e` (y las tres
  cuentas de la sección 3).
- **Una vez por cuenta:** la segunda llamada devuelve una transacción vacía.
- **CORS:** solo permite `https://testnet.blend.capital`. La web tendría que pedirla desde una
  función de Vercel (como `web/api/faucet.ts`), **sin ningún secreto**: solo reenvía la transacción.
- La cuenta necesita existir y tener 2 XLM extra de reserva (4 trustlines). Friendbot da 10 000.
- Contrato del USDC (SAC): `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU`.
- Dependemos de un servicio de Blend: para la demo en vivo, las cuentas de Ana, Beto y Carla se
  fondean antes.

## 5. Arreglo propuesto en la tanda (para los hallazgos 1.4)

Nunca gastar más participaciones que las propias de la tanda. Si el colateral anotado no alcanza en
la bóveda (pérdida o redondeo), la tanda entrega lo que realmente queda:

```rust
/// Saca `monto` de la bóveda para la tanda `t` sin tocar participaciones de otras tandas.
/// Devuelve lo que de verdad salió (menos que `monto` solo si la bóveda perdió valor).
pub(crate) fn sacar_de_boveda(env: &Env, boveda: &BovedaClient, t: &mut Tanda, monto: i128) -> i128 {
    if t.shares_boveda <= 0 {
        return 0;
    }
    let yo = env.current_contract_address();
    // Si valor(shares) >= monto, entonces ceil(monto / precio) <= shares: alcanza.
    if boveda.valor(&t.shares_boveda) >= monto {
        t.shares_boveda -= boveda.retirar_monto(&yo, &monto);
        monto
    } else {
        let entregado = boveda.retirar(&yo, &t.shares_boveda);
        t.shares_boveda = 0;
        entregado
    }
}
```

y en `cerrar_ronda`, donde hoy está `retirar_monto` + `bolsa += cubierto`:

```rust
let entregado = sacar_de_boveda(&env, &boveda, &mut t, cubierto);
bolsa += entregado;
```

- Funciona igual con la bóveda simulada y con Blend; en el caso normal no cambia nada.
- Cuesta una lectura más (`valor`) solo cuando alguien no pagó.
- Las pruebas de hallazgos pasan a comprobar lo contrario: B finaliza bien, y con la pérdida la
  ronda cierra con lo que hay.
- Toca `cerrar_ronda` (`lib.rs`), que también tocan M1 (faltantes, calendario, `boveda_de`) y M3.
  **Propuesta:** que M1 lo incluya en su MVP, porque ya está cambiando esas mismas líneas y su tope
  de precio vuelve el caso más probable. Si prefieren, lo hago yo después de que M1 esté en `integracion`.

## 6. Decisión de producto

**¿Cómo conviven TUSD (simulado) y Blend (real)?**

| Opción | Qué es | Pros | Contras |
| --- | --- | --- | --- |
| (a) Dos contratos de tanda | TUSD/simulada y XLM o USDC/Blend | No toca el contrato | La web maneja dos contratos (lobby, rutas, eventos): caro |
| **(b) Una bóveda por token (recomiendo)** | Un contrato; el admin registra token → bóveda; cada tanda guarda su bóveda al crearse | Un lobby, una web; encaja con `elegir_boveda` de M1 | Toca `elegir_boveda` (M1) y la web (símbolo, trustline, faucet por token) |
| (c) Todo en XLM con Blend | Sin TUSD | Onboarding simple (Friendbot) | Ahorrar en un activo volátil suena mal para el producto |

**Recomendación: (b) con TUSD + USDC de Blend.**
- Al crear: "TUSD · rendimiento simulado (rápido, para probar)" o "USDC · rendimiento real en Blend".
- Las dos son "dólares": la historia del producto no cambia. En el pitch: "en mainnet sería el USDC
  del pool de Blend".
- USDC necesita trustline + faucet de Blend (una sola firma, sección 4), igual que TUSD hoy.
- XLM: se puede registrar también (es desplegar otro adaptador y una llamada del admin). Lo dejo
  apagado por defecto en la web salvo que lo pidan.

**Cómo se ve en el contrato** (sobre el modelo ya acordado por M1 y ORQ):
- `almacenamiento::elegir_boveda(env, t)` (de M1) consulta primero `ClaveM4::BovedaToken(t.token)`;
  si no hay, sigue la regla de M1 (rápida o real para TUSD).
- `registrar_boveda(token, boveda)` (solo admin, en un archivo nuevo de M4). Solo afecta tandas
  **nuevas**: cada tanda ya guardó la suya al crearse, así que cambiar el registro no mueve dinero.
- `crear_tanda` con un token sin bóveda: error 55 `TokenSinBoveda` (rango de M4).

**Códigos de error de M4:**

| Código | Contrato | Nombre | Mensaje propuesto para la web |
| --- | --- | --- | --- |
| 50 | adaptador | `MontoInvalido` | El monto debe ser mayor que cero. |
| 51 | adaptador | `SharesInsuficientes` | La bóveda no tiene suficiente saldo de esta tanda. |
| 52 | adaptador | `ReservaNoEncontrada` | Blend no tiene una reserva para este activo. |
| 53 | adaptador | `QuemaInesperada` | Blend respondió algo inesperado; no se movió dinero. |
| 55 | tanda | `TokenSinBoveda` (propuesto) | Ese activo todavía no se puede usar en tandas. |
| 1206 | Blend | `InvalidPoolStatus` | Blend no está aceptando depósitos ahora. Prueba más tarde. |
| 1207 | Blend | `InvalidUtilRate` | Blend no tiene liquidez en este momento. Tu dinero está seguro; intenta en unos minutos. |
| 1220 | Blend | `ExceededSupplyCap` | Blend alcanzó su límite de depósitos para este activo. |
| 1223 | Blend | `ReserveDisabled` | Blend no está aceptando depósitos de este activo. |

## 7. Plan B (si Blend no queda sólido el domingo a las 20:00)

- La demo usa la versión simulada (TUSD) y **Blend no entra a `main`**.
- Blend se muestra con transacciones reales: `bash scripts/desplegar_blend.sh` y
  `bash scripts/demo_blend.sh` (XLM) o `ACTIVO=usdc ...` (USDC), y los enlaces de stellar.expert
  de la sección 3.
- En el pitch: "el contrato ya habla con Blend; aquí está una tanda completa en testnet".

## 8. Cómo reproducir

```bash
cargo test -p adaptador_blend                     # 19 pruebas (6 originales + 13 de auditoría)
stellar keys generate admin --network testnet --fund
bash scripts/desplegar_blend.sh && bash scripts/demo_blend.sh                  # XLM
ACTIVO=usdc bash scripts/desplegar_blend.sh && ACTIVO=usdc bash scripts/demo_blend.sh   # USDC (ver sección 4)
```
