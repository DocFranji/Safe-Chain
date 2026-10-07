# Plan v4: cuatro misiones nuevas antes de la entrega

Escrito por el ORQ el miércoles 7 de octubre de 2026. Entrega: **lunes 12, 16:00 CR**. Congelamiento: **domingo
11, 12:00**. Piloto con gente real: **sábado 10**.

## Decisiones (tomadas el 7 de octubre)

| # | Misión | Decisión |
| --- | --- | --- |
| N1 | Montos en dólares | `$100,00` grande y, debajo y en gris, la moneda real (`100 USDC` o `100 TUSD`). Siempre visible, sin selector |
| N2 | Bloquear morosos | Quien deba algo en **cualquier** tanda (terminada o en curso) no puede unirse a otra hasta pagar todo. Además, la deuda se puede pagar **después** de que la tanda termina |
| N3 | Cerrar la ronda antes | Si **todos** pagaron, se puede cerrar antes. **Las fechas quedan fijas**: quien cobra recibe ya, la ronda siguiente se puede pagar desde ya, y su fecha límite es la de siempre |
| N4 | Perfil | Sección "Perfil" con un **apodo público guardado en la red** (sin datos personales), el historial crediticio, las deudas y un botón **"Cerrar sesión"** que funcione también con Freighter |

Decisiones por defecto del ORQ (se pueden cambiar en el tablero):

- **N3 no aplica a la subasta** (ni sellada ni abierta): la subasta necesita la ronda completa para las ofertas. En
  los demás modos, sí.
- **N1:** las comisiones en XLM no se muestran como saldo. Solo se avisa si faltan ("Activa tu cuenta"). TUSD y USDC
  valen 1 dólar cada uno (testnet), así que la equivalencia es 1:1 y no hace falta un oráculo de precios.
- **N4:** el apodo tiene de 2 a 24 caracteres (letras, números, espacios, `.`, `-` y `_`). Se muestra con la dirección
  corta al lado (`Ana · GADM…TVPD`) para que nadie se haga pasar por otro.

## Por qué N2 va en el historial y no en el contrato de la tanda

El peor cierre de ronda hoy usa **41 de 50 escrituras** por transacción. Si la tanda llevara su propia lista de
deudores, cada moroso nuevo sumaría una escritura: con 11 morosos en el mismo cierre se pasaría del límite y **la
tanda quedaría trabada**.

El historial **ya** recibe ese dato en ese mismo cierre y ya lleva `veces_moroso` y `deudas_saldadas` por persona. Hoy
`veces_moroso > deudas_saldadas` ya significa "tiene una deuda abierta" (así se quita el descuento). El bloqueo se
lee de ahí en `ganchos::puede_unirse`: **cero escrituras extra** en el cierre y una lectura más al unirse.

## Quién hace qué

| Agente | Misiones | Rama | Cuenta sugerida |
| --- | --- | --- | --- |
| **M1** (`m1-tiempos-deudas`) | N2b (pagar deuda después de terminar) y N3 (cerrar antes) | `mision/m1-tiempos-deudas` | DocFranji |
| **M2** (`m2-historial`) | N2a (bloqueo de morosos) y N4 (apodo, perfil y cerrar sesión) | `mision/m2-historial` | DocFranji |
| **WEB** (`web-preview`) | Terminar el rediseño (PR #23) con el tema elegido y luego N1 (dólares) | `mision/web-preview` | Paul |
| **ORQ** | Revisar, integrar, preparar el despliegue v4 y la salida a producción | `mision/orquestador` | Paul |
| **M3** | Sin trabajo nuevo. Solo responde si M1 le pregunta por la subasta en N3 | — | — |

Máximo 2 agentes activos por cuenta: DocFranji tiene M1 y M2; Paul tiene ORQ y WEB.

### M1 · N2b: pagar la deuda después de que la tanda termina

- `deudas.rs::pagar_deuda`: aceptar también `Estado::Finalizada`. Misma firma.
- Después de finalizar, el contrato ya no guarda dinero de esa tanda. El pago va **directo de quien paga a quien cobró
  de menos** (`Faltante.acreedor`), sin pasar por la bóveda ni por `retenido`.
- Caso especial: el faltante de su **propia** ronda (bolsa retenida). Decide M1 qué es lo justo (por ejemplo, que
  vaya al fondo de quienes cumplieron o que ese faltante se cancele al finalizar) y lo explica en `docs/tiempos-y-deudas.md`.
- Al saldar todo, debe seguir llamando a `ganchos::al_pagar_deuda` para que el historial anote `DeudaSaldada`. Eso es
  lo que **desbloquea** a la persona (N2a).
- Los datos de `Miembro` y `Deuda` de una tanda terminada con deuda deben vivir lo suficiente (TTL) para que se pueda
  pagar. Renovarlos al finalizar y al pagar.
- Pruebas: pagar después de finalizar (completo y en partes, por otra persona), `assert_conservacion()`, y que pagar
  de más o sin deuda siga fallando.

### M1 · N3: cerrar la ronda antes si todos pagaron

- `lib.rs::cerrar_ronda`: si `ahora < vence` y **todos** los miembros pagaron la ronda actual (ninguno moroso), se
  permite cerrar. Si no, sigue el error `RondaNoVencida` (9). En subasta: no se permite antes de tiempo (error nuevo).
- `tiempos.rs`: con cierre anticipado, la ronda siguiente **conserva su fecha límite** (`vence_anterior + periodo`).
  Hoy `inicio_siguiente` supone que el resultado nunca está en el futuro: hay que revisar todos los usos de
  `inicio_ronda` (pago tarde, mitad de la ronda en la subasta sellada, calendario `.ics`, la web) para que una ronda
  abierta "antes de su inicio" funcione. Lo más simple puede ser guardar la fecha límite aparte; lo decide M1.
- Evento nuevo para la historia de la web (por ejemplo, "Todos pagaron: la ronda se cerró antes").
- Web: en `CerrarRonda.tsx`, si todos pagaron, el botón "Cerrar la ronda" aparece antes de que venza ("Todos
  pagaron: cerrar ya y pagarle a Carla").
- Pruebas: cierre anticipado en cada modo menos subasta, error en subasta y con alguien sin pagar, fechas siguientes
  sin cambio, invariantes al azar (`test_invariantes.rs`) con cierres anticipados, y peor caso con 12 personas.

### M2 · N2a: bloquear a quien tiene deudas

- `ganchos::puede_unirse`: si el historial dice `veces_moroso > deudas_saldadas`, rechazar con un error nuevo ("Tienes
  una deuda pendiente en otra tanda. Págala desde tu Perfil para volver a unirte").
- Debe aplicar a **todas** las formas de unirse (`unirse` y `unirse_en_turno`). Pruebas de las dos.
- Verificar que `Hecho::Moroso` se anota **una vez por caída en mora** (no en cada ronda que sigue moroso) y
  `DeudaSaldada` una vez al llegar a cero. Si no, el contador queda mal y alguien se queda bloqueado para siempre.
  Prueba: cae en mora, paga, vuelve a caer y vuelve a pagar, y queda desbloqueado.
- Si el historial no responde, no bloquear: el gancho nunca traba la operación (regla del protocolo, §6.2).
- Web: al intentar unirse con deuda, el mensaje claro y un enlace a "Perfil → Mis deudas".

### M2 · N4: perfil, apodo y cerrar sesión

- **Contrato `historial`:** `poner_apodo(quien: Address, apodo: String)` (firma `quien`), `quitar_apodo(quien)` y
  `apodo(quien) -> Option<String>`. Valida largo y caracteres. Evento `apodo`. No toca el cálculo del puntaje.
- **Web:**
  - Ruta `#/perfil`, y "Perfil" en el menú en lugar de "Mi historial". `#/historial/<dirección>` sigue existiendo.
  - Contenido: apodo (editar y guardar con una firma), dirección y forma de entrar (Google o Freighter), el
    historial crediticio, "Mis deudas" (con N2b de M1: cuánto debe, en qué tanda y el botón "Pagar") y "Cerrar sesión".
  - `nombreDe()`: apodo, luego `VITE_NOMBRES`, luego dirección corta. Hay que leer los apodos con poco costo: una
    lectura por persona visible y en caché.
  - **Cerrar sesión con Freighter:** Freighter no tiene una función para desconectar sitios. La web debe "olvidar" la
    cuenta: no reconectarse sola al cargar (una marca en `localStorage`) hasta que la persona vuelva a pulsar
    "Entrar con Freighter". Explicar en el Perfil que para quitar el permiso del todo se hace desde Freighter.
- Pruebas: contrato (apodo válido e inválido, solo el dueño lo cambia) y navegador (perfil, cerrar sesión con
  Freighter y Google, y que al recargar siga fuera).

### WEB · Rediseño (PR #23) y N1: dólares

1. **Primero el PR #23**, con el tema que elija el equipo (Carreta o Fintech). Se integra **antes** que lo demás,
   porque toca casi toda la web y las misiones de M1 y M2 lo traen con `git merge origin/integracion`.
2. **N1:**
   - Una sola función de formato para el dinero (por ejemplo, `dinero(valor, moneda)` en `lib/formato.ts`) que dé
     `$100,00` y la línea chica `100 USDC`. Cambiar los ~116 lugares que hoy escriben `{monto(...)} {SIMBOLO}`.
   - Formularios: la cuota se escribe en dólares (`$`).
   - En los textos: "dólares" en vez de "TUSD" ("Pedir dólares de prueba"). Donde la moneda importe (crear una
     tanda, la nota de Blend), se dice cuál es.
   - El saldo de XLM no se muestra. Solo "Activa tu cuenta" si falta.
   - La historia (`historia.ts`) y los resultados también en `$`.
   - Pruebas: unitarias de `dinero()` y actualizar las del navegador que buscan "TUSD" en el texto.

## Interfaces y rangos (para no pisarse)

| Qué | Dueño | Detalle |
| --- | --- | --- |
| Errores 60–64 del contrato `tanda` | M1 | Cierre anticipado (subasta, no todos pagaron) |
| Errores 65–69 del contrato `tanda` | M2 | Bloqueo por deuda |
| Errores del contrato `historial` | M2 | Su propio rango, para el apodo |
| Eventos nuevos | Cada uno | Tópicos de 9 caracteres o menos. Avisar el nombre en el tablero y agregar su frase en `historia.ts` |
| `lib.rs::cerrar_ronda`, `tiempos.rs` | M1 | Cambio mínimo y avisado |
| `ganchos.rs::puede_unirse` | M2 | |
| `web/src/lib/formato.ts` (`dinero`) | WEB | M1 y M2 usan `dinero()` cuando WEB la integre. Mientras tanto, lo de siempre y WEB lo cambia al integrar |
| `web/src/lib/nombres.ts` (`nombreDe` con apodo) | M2 | |
| `web/e2e/mock.mjs` | Todos | Cada uno agrega lo suyo. Si chocan las importaciones de `run.mjs`, se unen las listas |
| `web/packages/*` | Generado | `bash scripts/generar_cliente.sh`, nunca a mano |

Cada PR cumple la Definición de Terminado (`agentes/PROTOCOLO.md` §8): `verificar.sh` en verde, peor caso con 12
personas si toca contratos (`PEOR_CASO_WASM=1`, ahora también con el límite de 16 384 B de eventos), cliente
regenerado y escenarios nuevos en el navegador.

## Calendario (hora de Costa Rica)

| Cuándo | Qué | Quién |
| --- | --- | --- |
| **Mié 7, hoy** | Salida a producción con la v3 **o** renovar la v2 (vence hoy ~23:00) | DocFranji |
| Mié 7 | Elegir el tema del rediseño (Carreta o Fintech) | Equipo |
| Mié 7 | Arrancan M1, M2 y WEB | Paul y DocFranji los lanzan |
| Jue 8, 12:00 | PR #23 (rediseño) listo, revisado e integrado | WEB y ORQ |
| Jue 8, 20:00 | PRs de M1 y M2 listos. El ORQ los ensaya juntos y los integra | M1, M2 y ORQ |
| Vie 9, 08:00 | PR de N1 (dólares) listo e integrado | WEB y ORQ |
| Vie 9, 10:00 | **Despliegue v4** (tanda + historial nuevos) desde `integracion` | DocFranji |
| Vie 9, todo el día | Pruebas en la vista previa: `PROBAR-V3.md` y lo nuevo | Equipo |
| Vie 9, 20:00 | Segunda salida a producción | DocFranji |
| Sáb 10 | Piloto con gente real y primera toma del video | Equipo |
| Dom 11, 12:00 | Congelamiento | — |

## Riesgos y plan B

- **Poco tiempo para contratos nuevos.** Si a las 20:00 del jueves un PR de contrato no está verde, **no entra**. Lo
  que sí esté listo se despliega el viernes. N1 y la parte web de N4 (perfil sin apodo y cerrar sesión) no dependen
  del contrato y entran igual.
- **Desplegar v4 crea contratos nuevos:** las tandas de prueba de la v3 no pasan a la v4. Para el piloto y el video
  da igual.
- **N3 cambia el calendario:** es lo más delicado. Las invariantes al azar deben incluir cierres anticipados antes de
  integrar.
- **Apodos:** son públicos y cualquiera elige el suyo. Por eso siempre se muestran con la dirección corta.
