# Rounda: tandas con contrato inteligente en Stellar

Una tanda es un grupo que aporta la misma cuota cada ronda y, por turnos, uno recibe todo. Funciona por confianza, y el riesgo de siempre es el mismo: **el primero cobra y desaparece**. Rounda deja las reglas en un contrato inteligente (Soroban, en Stellar): el contrato guarda el dinero, exige una garantía a quien cobra antes, cobra multas por atraso y hace trabajar la garantía mientras espera.

> **Solo para testnet y demo.** El dinero es de prueba (TUSD) y el contrato no está auditado: no usar con dinero real.

**Pruébalo:** https://rounda-phi.vercel.app (entra con una cuenta de Google o con la billetera Freighter; el guion de la demo está en [`DEMO.md`](DEMO.md) y el del pitch en [`PITCH.md`](PITCH.md)).

## Cómo funciona

1. **Se crea la tanda**: cuota, número de personas, duración de cada ronda, multa por atraso y cuánta garantía cubre lo que aún se debe. Se comparte el enlace.
2. **Cada quien deja una garantía al unirse.** Quien cobra antes deja más, porque después de cobrar todavía debe cuotas. Ejemplo con 3 personas y cuota de 100 TUSD: el turno 1 deja 200, el turno 2 deja 100 y el turno 3 deja 100.
3. **Cada ronda todos pagan su cuota** y el contrato entrega la bolsa a quien le toca.
4. **Si alguien no paga, su garantía cubre su cuota.** Quien cobra recibe la bolsa completa y el grupo no pierde nada.
5. **Pagar tarde tiene costo:** una multa que se descuenta de la garantía y se reparte, al final, entre quienes nunca se atrasaron.
6. **Al terminar**, cada quien recupera lo que le sobró de garantía más su parte del rendimiento, que la garantía generó en una bóveda mientras esperaba.
7. **Quien queda en mora puede pagar su deuda** (o un familiar por él). El dinero le llega a quien cobró de menos por su atraso y la persona vuelve a estar al día.

Cualquiera puede cerrar una ronda vencida, así que nadie puede bloquear la tanda. Las rondas pueden durar de 1 minuto a 3 meses (semanal, quincenal, mensual...), con fechas de pago fijas: un cierre atrasado no corre el calendario. Detalles en [`docs/tiempos-y-deudas.md`](docs/tiempos-y-deudas.md).

**Quién cobra primero lo decide el grupo**, no solo el orden de llegada. Al crear la tanda se elige el mecanismo ([`docs/turnos.md`](docs/turnos.md)):

- **Precio por turno** (como MoneyFellows): quien tiene prisa paga una prima y quien espera la gana. Suma cero: el contrato no se queda con nada.
- **Subasta** (como los chit funds de la India): cada ronda gana quien acepte recibir menos, y ese descuento se reparte entre los demás.
- **Sorteo:** el contrato sortea el orden cuando se llena la tanda.
- **Elegir e intercambiar:** cada quien elige su turno y lo puede cambiar con otro, con una compensación si se ponen de acuerdo.

En todos, quien cobra deja la misma garantía de siempre. En el sorteo y la subasta, como el turno no se conoce al unirse, todos dejan una cuota y el resto se aparta de la bolsa al cobrar.

## Qué hay construido

| Pieza | Qué hace | Dónde |
| --- | --- | --- |
| Contrato de la tanda | Reglas, garantías, multas, rondas, liquidación y eventos | `contracts/tanda/` |
| Mecanismos de turnos | Precio por turno, subasta, sorteo, elegir turno e intercambio (`crear_tanda_avanzada`) | `contracts/tanda/src/turnos*.rs`, `docs/turnos.md` |
| Historial crediticio | Puntaje público e inmutable por dirección (cuotas a tiempo, atrasos, mora, deudas saldadas); da descuento de garantía y acceso a tandas exigentes. Ver [`docs/historial.md`](docs/historial.md) | `contracts/historial/`, `web/src/pages/Historial.tsx` |
| Bóveda simulada | Rendimiento de ejemplo con la misma interfaz que tendría un adaptador a Blend | `contracts/boveda_simulada/` |
| Web (React) | Landing, lobby, crear tanda, invitaciones, resultados, demo en vivo y estado del sistema | `web/` |
| Entrar con Google | Billetera Stellar creada y firmada por [Privy](https://privy.io); también funciona Freighter | `web/src/cuentas/`, `web/src/lib/firmante.ts` |
| Faucet de TUSD | Función serverless de Vercel que regala TUSD de prueba | `web/api/faucet.ts` |
| Scripts | Desplegar en testnet y correr la demo desde la terminal | `scripts/` |

```
 Navegador (React, Vercel)                          Stellar testnet
 ┌──────────────────────────────┐   lecturas     ┌──────────────────────┐
 │ Landing · Lobby · Tanda      │ ─────────────▶ │ RPC de Soroban        │
 │ Demo en vivo · Estado        │                │   ├ contrato `tanda`  │
 │                              │   firmas       │   ├ bóveda simulada   │
 │ Firma con Freighter          │ ─────────────▶ │   └ token TUSD        │
 │   o con Privy (Google)       │                └──────────────────────┘
 └──────────────┬───────────────┘
                │ /api/faucet (solo testnet)
                ▼
      Cuenta emisora de TUSD
```

## Límites actuales (dichos con claridad)

- **No está auditado** y solo corre en testnet.
- **La bóveda es simulada.** Las tandas reales (días, semanas o meses) rinden 5 % anual al ritmo de la vida real; las tandas de prueba (rondas de hasta 10 minutos) usan una bóveda acelerada para que el rendimiento se note en una demo. La interfaz de la bóveda permite cambiarla por un adaptador a Blend sin tocar el contrato de la tanda (ver más abajo).
- **Las billeteras de Google las custodia Privy.** Es cómodo para probar, pero en producción habría que decidir el modelo de custodia.
- **El faucet regala dinero de prueba:** nunca debe apuntar a una cuenta con valor real.
- **El historial crediticio no prueba identidad.** Es evidencia pública de cumplimiento; para tandas grandes conviene combinarlo con verificación (el contrato ya tiene el gancho `marcar_verificado`). Los eventos hecho por hecho solo los guarda el RPC unos días: la página muestra los acumulados.
- **Los flujos que firman** (crear, unirse, pagar) no tienen pruebas automáticas contra la red real: la interfaz se verificó con un RPC simulado y los recorridos reales se hacen a mano en testnet antes de cada demo.

## Qué hay en cada carpeta

| Ruta | Qué es |
| --- | --- |
| `contracts/tanda/src/lib.rs` | El contrato de la tanda. Todas las reglas están comentadas en español |
| `contracts/tanda/src/test.rs` | Las 16 pruebas, incluido el escenario exacto de la demo |
| `contracts/historial/src/lib.rs` | Historial crediticio: puntaje, niveles y reglas anti-trampa. Solo escriben los contratos de tanda autorizados |
| `contracts/boveda_simulada/src/lib.rs` | Bóveda con rendimiento simulado (misma interfaz que tendría un adaptador a Blend) |
| `scripts/desplegar_testnet.sh` | Crea cuentas, el token TUSD y despliega los dos contratos en testnet |
| `scripts/demo.sh` | Corre el guion de la demo desde la terminal (~5 min). Ver [`DEMO.md`](DEMO.md) |
| `scripts/preparar_entorno.sh` | Instala el target WASM, la CLI de Stellar y las dependencias (también lo usan las sesiones de Claude Code en la nube) |
| `scripts/generar_cliente.sh` | Regenera el cliente TypeScript de los contratos para la web |
| `web/e2e/` | Pruebas de navegador con Stellar y Freighter simulados |
| `agentes/`, `.claude/agents/`, `CLAUDE.md` | Equipo de agentes de Claude Code: protocolo, misiones y [guía de orquestación](agentes/GUIA-ORQUESTACION.md) |

## 1. Instalar (una vez por computadora)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
# Stellar CLI (la versión más reciente: el SDK 28 la necesita)
cargo install --locked stellar-cli
```

En Windows usen WSL (Ubuntu) o sigan la guía oficial de instalación de la Stellar CLI.

## 2. Correr las pruebas

**Estado del contrato:** 16 de 16 pruebas pasan y el dinero cuadra en todos los escenarios (prueba `assert_conservacion`). Probado con `soroban-sdk` 28.0.0; testnet está en el protocolo 29, que es compatible.

```bash
cargo test
cargo test escenario_demo -- --nocapture   # muestra el rendimiento que reparte la demo
```

**Regla del equipo:** si cambian algo del contrato, `cargo test` tiene que seguir en verde antes de desplegar.

## 3. Desplegar en testnet

```bash
bash scripts/desplegar_testnet.sh
```

Qué hace, en orden:

1. Crea 5 cuentas (admin, emisor, ana, beto, carla) y les da XLM gratis con Friendbot.
2. Compila los contratos a WASM (`stellar contract build`).
3. Crea el token TUSD.
4. Hace que ana, beto y carla acepten TUSD (trustline).
5. Les reparte 1 000 TUSD a cada una.
6. Despliega dos bóvedas y las fondea con 10 000 TUSD cada una para que puedan pagar intereses: la principal (5 % anual al ritmo real) y la rápida (acelerada, solo para tandas de prueba con rondas de hasta 10 minutos; `SIN_BOVEDA_RAPIDA=1` para no crearla).
7. Despliega la tanda, la inicializa con la bóveda principal y le configura la rápida.

Las direcciones quedan en `scripts/.contratos`.

**Por qué la trustline:** en Stellar, una cuenta normal tiene que "aceptar" un token antes de poder recibirlo. Es una protección contra el spam de tokens. Los contratos no la necesitan.

**En Freighter:** para usar sus propias wallets en la interfaz, cada una tiene que agregar el activo TUSD con el emisor que imprime el script (*Manage assets → Add manually*).

## 4. Correr la demo desde la terminal

```bash
bash scripts/demo.sh
```

Es el mismo guion del video. Ana cobra primero y desaparece, Beto paga tarde, y al final se ven los saldos.

Para presentarla al jurado (pantalla proyectada, qué decir y plan B), vean [`DEMO.md`](DEMO.md). Variables útiles: `WEB=https://tu-sitio PAUSAR=1 bash scripts/demo.sh`.

Los mecanismos de turnos tienen su propio guion (unos 4 minutos por modo):

```bash
MODO=sorteo bash scripts/demo_turnos.sh        # también: precio, subasta, intercambio o todos
```

## 5. La interfaz web

La interfaz vive en `web/` (React): landing, lobby, crear tanda, invitaciones, rendimiento, resultados, demo en vivo y faucet de TUSD. Se entra con Google (Privy) o con Freighter. Para correrla y desplegarla, vean [`web/README.md`](web/README.md).

Si cambian la interfaz del contrato, regeneren el cliente TypeScript (revisen `stellar contract bindings typescript --help` por si cambió algún nombre):

```bash
source scripts/.contratos
stellar contract bindings typescript --network testnet --contract-id $TANDA --output-dir web/packages/tanda
(cd web/packages/tanda && npm install && npm run build)
```

Funciones que usa la interfaz:

- **Firman con la wallet del usuario:** `crear_tanda`, `unirse`, `pagar_cuota`.
- **Cualquiera puede apretarlas:** `cerrar_ronda`, `finalizar`.
- **Solo leen, no piden firma:** `get_tanda`, `get_miembros`, `get_ronda`, `total_tandas`, `colateral_siguiente`.

Muestren `colateral_siguiente` antes de que alguien se una, para que sepa cuánto va a depositar.

**Códigos de error para mostrar mensajes en español:**

| Código | Error | Mensaje sugerido |
| --- | --- | --- |
| 1 | YaInicializado | El contrato ya está configurado |
| 2 | NoEncontrada | Esa tanda no existe |
| 3 | EstadoInvalido | La tanda no está en la etapa correcta para esto |
| 4 | ParametroInvalido | Revisa los datos de la tanda |
| 5 | YaEsMiembro | Ya estás en esta tanda |
| 6 | TandaLlena | La tanda ya está completa |
| 7 | NoEsMiembro | No eres miembro de esta tanda |
| 8 | YaPago | Ya pagaste esta ronda |
| 9 | RondaNoVencida | Todavía no vence la ronda |
| 10 | MiembroMoroso | Tienes una deuda pendiente en esta tanda |
| 11 | NoVerificado | Tu dirección no está verificada |
| 12 | NoAutorizado | No tienes permiso para esto |
| 13 | NoInicializado | El contrato no se ha configurado |

## Cambios respecto a la especificación

Todo lo de la especificación está implementado. Agregué esto porque la interfaz o la seguridad lo necesitaban:

- **`marcar_verificado`:** la función con la que el verificador habilita direcciones (P2, gancho para la SUGEF). La spec la mencionaba, pero no tenía firma definida.
- **`total_tandas` y `colateral_siguiente`:** consultas para la interfaz.
- **Error 13 `NoInicializado`:** evita crear tandas antes de configurar el contrato.
- **Eventos `liquidado`** (cuánto recibió cada miembro al final) y **`cancelada`**.

## Cambiar la bóveda simulada por Blend (P3, máximo 4 horas)

La tanda solo usa 4 funciones de la bóveda: `depositar`, `retirar`, `retirar_monto` y `valor`. Para usar Blend:

1. Creen un contrato adaptador nuevo con esas mismas 4 funciones, que por dentro llame al pool de Blend (`submit` con supply/withdraw, y la b-rate de `get_reserve` para `valor`).
2. Despliéguenlo.
3. Hagan un deploy nuevo de la tanda e inicialícenla con la dirección del adaptador como `boveda`.

El contrato de la tanda **no se toca**. Si no funciona a tiempo, se quedan con la simulada y lo dicen en la presentación.
