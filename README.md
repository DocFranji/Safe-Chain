# Tanda On-Chain: contratos (Stellar / Soroban)

Tandas con contrato inteligente. El contrato maneja la rotación, cobra un colateral escalonado para que nadie cobre primero y desaparezca, aplica multas por atraso, y el colateral genera rendimiento mientras espera.

**Estado:** 16 de 16 pruebas pasan. El dinero cuadra en todos los escenarios (prueba `assert_conservacion`). Probado con `soroban-sdk` 28.0.0. Testnet está en el protocolo 29, que es compatible.

> Solo para testnet y demo. No está auditado: no usar con dinero real.

## Qué hay en cada carpeta

| Ruta | Qué es |
| --- | --- |
| `contracts/tanda/src/lib.rs` | El contrato de la tanda. Todas las reglas están comentadas en español |
| `contracts/tanda/src/test.rs` | Las 16 pruebas, incluido el escenario exacto de la demo |
| `contracts/boveda_simulada/src/lib.rs` | Bóveda con rendimiento simulado (misma interfaz que tendría un adaptador a Blend) |
| `scripts/desplegar_testnet.sh` | Crea cuentas, el token TUSD y despliega los dos contratos en testnet |
| `scripts/demo.sh` | Corre el guion de la demo desde la terminal (~8 min) |

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
6. Despliega la bóveda y la fondea con 10 000 TUSD para que pueda pagar intereses.
7. Despliega la tanda y la inicializa.

Las direcciones quedan en `scripts/.contratos`.

**Por qué la trustline:** en Stellar, una cuenta normal tiene que "aceptar" un token antes de poder recibirlo. Es una protección contra el spam de tokens. Los contratos no la necesitan.

**En Freighter:** para usar sus propias wallets en la interfaz, cada una tiene que agregar el activo TUSD con el emisor que imprime el script (*Manage assets → Add manually*).

## 4. Correr la demo desde la terminal

```bash
bash scripts/demo.sh
```

Es el mismo guion del video. Ana cobra primero y desaparece, Beto paga tarde, y al final se ven los saldos.

## 5. La interfaz web

La interfaz vive en `web/` (React + Freighter): lobby, crear tanda, invitaciones, rendimiento, resultados y faucet de TUSD. Para correrla y desplegarla, vean [`web/README.md`](web/README.md).

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
