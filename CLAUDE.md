# Rounda: tandas con contrato inteligente en Stellar

Proyecto de hackathon (Find Your Way, Costa Rica; entrega: **lunes 5 oct 2026, 4:00 p.m. hora CR**). Una tanda es ahorro rotativo: todos aportan una cuota por ronda y, por turnos, uno recibe la bolsa. Aquí las reglas las cumple un contrato Soroban: garantía escalonada, multas y rendimiento de la garantía. **Solo testnet.**

## Si eres un agente de misión

1. Lee **`agentes/PROTOCOLO.md`** (obligatorio): ramas, comunicación, zonas de propiedad, interfaces y Definición de Terminado.
2. Lee tus instrucciones en `.claude/agents/<tu-agente>.md` (`orquestador`, `m1-tiempos-deudas`, `m2-historial`, `m3-turnos`, `m4-blend`, `m5-sinpe`).
3. Coordínate en el tablero: issue #4 de GitHub ("🧭 Tablero de agentes").

## Estructura

```
contracts/tanda/src/        Contrato principal, dividido por responsabilidad:
  lib.rs                    flujo: inicializar, crear_tanda, unirse, pagar_cuota, cerrar_ronda, finalizar, cancelar
  tipos.rs  eventos.rs      datos guardados y errores / eventos publicados
  consultas.rs              get_* (solo lectura; segundo #[contractimpl])
  turnos.rs                 quién cobra y cuánto colateral deja cada turno
  ganchos.rs                avisos internos (para el historial crediticio)
  almacenamiento.rs         leer/guardar y TTL
  test.rs                   pruebas + helpers pub(crate) (setup, Ctx, assert_conservacion)
contracts/boveda_simulada/  bóveda con rendimiento simulado (acelerado para la demo)
web/                        React 19 + Vite + TypeScript. Router por hash (#/tandas, #/tanda/N, #/crear, #/demo, #/estado)
  src/lib/                  lógica pura con pruebas (colateral, formato, historia de eventos, contrato, firmante...)
  packages/tanda/           cliente TS GENERADO del contrato (no editar: scripts/generar_cliente.sh)
  api/faucet.ts             función serverless de Vercel que regala TUSD de prueba
  e2e/                      pruebas de navegador con RPC/Freighter simulados (Playwright)
scripts/                    desplegar_testnet.sh, demo.sh, generar_cliente.sh, preparar_entorno.sh
agentes/                    protocolo del equipo de agentes y guía de orquestación
```

## Comandos

```bash
cargo test                                # pruebas de contratos (no necesita la CLI de Stellar)
cargo fmt --all && cargo clippy --all-targets
stellar contract build                    # WASM: con soroban-sdk 28 SOLO funciona con la CLI (no con cargo build --target)
bash scripts/generar_cliente.sh           # regenera web/packages/tanda tras cambiar la interfaz del contrato
bash scripts/preparar_entorno.sh          # instala target wasm, CLI de Stellar y dependencias si faltan

cd web && npm ci && npm run lint && npm test && npm run build
cd web && npm run preview                 # sirve dist/ en :4173
cd web/e2e && npm ci && npm test          # pruebas de navegador contra :4173
```

## Convenciones

- **Español** en la interfaz, los comentarios, los commits y los PRs (como el resto del repo). Textos de interfaz claros y sin jerga cripto.
- Montos en `i128` con 7 decimales (100 TUSD = `1_000_000_000`). Porcentajes en puntos básicos (10 000 = 100 %).
- Todo cambio que mueva dinero lleva prueba con `assert_conservacion()`. Máximo 12 miembros: prueba el peor caso.
- Funciones nuevas del contrato en archivos propios con su propio `#[contractimpl] impl TandaContract` (importa `TandaContractArgs` y `TandaContractClient` desde `crate`, como `consultas.rs`).
- La web pide firma con Freighter o con la billetera de Google (Privy): usa `clienteFirma` de `web/src/lib/contrato.ts`; nunca llames a Freighter directo.
- Errores del contrato: código fijo y mensaje en español en `web/src/lib/contrato.ts`.

## Producción (no romper)

- `main` está desplegado en Vercel (https://rounda-phi.vercel.app) y apunta a contratos ya desplegados en testnet (IDs por defecto en `web/src/config.ts`; Vercel puede sobrescribirlos con variables `VITE_*`).
- Cambiar la interfaz o los datos del contrato exige **desplegar contratos nuevos** y actualizar la web a la vez. Por eso las misiones se integran primero en la rama `integracion`.
- Secretos (`FAUCET_ISSUER_SECRET`, llaves `S...`, App Secret de Privy) solo en variables de entorno de Vercel o en la máquina local. Nunca en el repo ni en el chat.
