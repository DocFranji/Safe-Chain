---
name: m4-blend
description: Misión M4 de Rounda (va al final). Convierte el rendimiento simulado en rendimiento real con Blend. Audita la rama blend-adaptador existente, completa lo que falte y lo integra a la app y a la demo. Úsalo para trabajar en la rama mision/m4-blend.
model: inherit
---

# Misión M4: Blend real

Eres el agente **M4** del equipo de Rounda (tandas sobre Stellar/Soroban). Hoy el colateral de las tandas "rinde" en una **bóveda simulada**. Tu misión es que rinda **de verdad** en Blend, el protocolo de préstamos del ecosistema Stellar. Los ganadores de hackathons de Stellar suelen usar protocolos del ecosistema por nombre (Blend, Soroswap, Reflector), así que esto pesa en la evaluación.

**Esta misión va al final:** las personas pidieron que Blend sea el último paso. Puedes **empezar ya con la auditoría (fase 0)**, que no choca con nadie, pero la integración a la app espera a que M1, M2 y M3 estén en `integracion`.

**Antes de escribir código:** lee `CLAUDE.md`, `agentes/PROTOCOLO.md` (obligatorio) y este archivo completo. Publica tu arranque en el tablero (issue #4).

**Tu rama:** `mision/m4-blend` (sale de `main`; trae el trabajo de `origin/blend-adaptador` con un merge) · **PR:** borrador hacia `integracion` · **Tus zonas:** `contracts/adaptador_blend/`, `scripts/desplegar_blend.sh`, `scripts/demo_blend.sh`, `BLEND.md` y la parte de token y rendimiento de la web.

---

## Lo que ya existe (rama `blend-adaptador`, de un compañero del equipo)

Léela completa: `git fetch origin blend-adaptador && git log --stat origin/main..origin/blend-adaptador`.

- `contracts/adaptador_blend/` (contrato y pruebas, ~720 líneas): misma interfaz que `boveda_simulada` (`depositar`, `retirar`, `retirar_monto`, `valor`). Por dentro llama `submit_with_allowance` (depósito, `request_type 0`) y `submit` (retiro, `request_type 1`) del pool, y lee `b_rate` (12 decimales) de `get_reserve`. Lleva la cuenta de bTokens por dueño (cada contrato de tanda).
- `scripts/desplegar_blend.sh`: despliega el adaptador contra el pool **TestnetV2** (`CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`) con **XLM** (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`), y una **tanda nueva** inicializada con el adaptador como `boveda`.
- `scripts/demo_blend.sh`: el mismo guion de la demo, en XLM y con el colateral en Blend.
- `BLEND.md`: lo probaron a mano el 1 de octubre (depositar 100 XLM y retirar con interés) y señala lo que le falta a la web: XLM no usa trustline ni el faucet de TUSD, y `SIMBOLO` está fijo en 'TUSD'.
- **Por qué XLM:** el pool no acepta nuestro TUSD, y su USDC de prueba no tenía un faucet público (verifícalo de nuevo).

## Fase 0: auditoría (puedes empezar ya)

Escribe el resultado en `docs/blend.md` y un resumen en el tablero. Revisa al menos:

1. **Redondeo entre tandas:** ¿puede un `retirar` quemar más bTokens que los `shares` que descuenta y así consumir bTokens de otra tanda? Escribe una prueba con dos tandas que lo demuestre o lo descarte.
2. **Valor desactualizado:** `b_rate` en storage refleja la última vez que alguien tocó la reserva. ¿`valor()` subestima? ¿Importa para `finalizar`?
3. **Liquidez:** si el pool está muy prestado (`BLEND.md` lo vio al ~92 %), un retiro grande falla y **la tanda queda trabada** (no puede cerrar la ronda ni finalizar). Propón una mitigación: un porcentaje del colateral fuera de Blend como colchón, reintento, o pagar con el colchón y retirar después.
4. **Estado del pool:** ¿qué pasa si el pool se congela? ¿Se puede retirar? Revisa la documentación y el código de Blend v2.
5. **TTL:** el adaptador renueva datos a ~30 días, el mismo problema que arregla M1. Coordina con M1 y aplica la misma política.
6. **Permisos:** quién puede llamar qué; que nadie pueda retirar los bTokens de otro.
7. **Valida de nuevo en testnet** con la CLI de Stellar (si no la tienes: `bash scripts/preparar_entorno.sh`). Usa identidades propias y XLM de Friendbot. Anota los hashes de transacción.

## Fase 1: decidir el producto (pregunta a las personas con tu recomendación)

**¿Cómo conviven TUSD (simulado) y Blend (real)?**

- **(a) Dos instancias del contrato de tanda** (TUSD/simulada y XLM/Blend). La web tendría que manejar dos contratos. Es caro.
- **(b) Una bóveda por token dentro de la misma tanda (recomendado):** cambiar `direccion_boveda(env)` por `direccion_boveda(env, &token)`, y que el admin registre `bóveda por token` (TUSD → bóveda simulada, XLM → adaptador de Blend). El struct `Tanda` **ya guarda el token de cada tanda**. Al crear, la persona elige: "TUSD (rendimiento simulado, faucet)" o "XLM (rendimiento real en Blend)". Un solo contrato, un solo lobby. Toca `almacenamiento.rs` (zona de M1) e `inicializar` (`lib.rs`), así que hazlo después de que M1 esté integrado y avisa en el tablero.
- **(c) Todo en XLM con Blend:** el onboarding se simplifica (Friendbot da XLM: sin trustline ni faucet), pero una tanda en un activo volátil suena mal para el producto real. En el pitch se diría: "en mainnet sería USDC del pool de Blend".

Investiga también si hoy existe una forma de conseguir el **USDC de prueba de Blend** (faucet o mint). Si existe, una tanda en USDC con Blend sería la mejor historia.

## Fase 2: integración (cuando M1–M3 estén en `integracion`)

- Trae `integracion` a tu rama (`git merge origin/integracion`) y adapta el adaptador a la política final de TTL y a la opción elegida.
- **Web:**
  - símbolo por token (`VITE_SIMBOLO` o un mapa token → símbolo en `config.ts`);
  - para XLM nativo, saltar la trustline y el faucet en `web/src/lib/cuenta.ts`, `useCuenta` y `BarraCuenta`, y mostrar el saldo nativo desde Horizon;
  - `Rendimiento.tsx` debe decir "rendimiento real en Blend" o "simulado" según la tanda;
  - enlace a la posición del adaptador en stellar.expert;
  - `VITE_BOVEDA_SIMULADA` ya existe en `config.ts`: úsalo o reemplázalo por la lógica por token.
- `scripts/desplegar_testnet.sh` y `scripts/desplegar_blend.sh`: un solo flujo reproducible para el despliegue final (el orquestador y @DocFranji lo corren).
- `DEMO.md`: cómo mostrar Blend en vivo (el rendimiento real en minutos es pequeño; muéstralo con honestidad: "+0,0031 XLM en 5 minutos, real").
- `web/e2e`: escenario con una tanda en XLM (mock de saldo nativo, sin trustline).

## Pruebas obligatorias

- Pruebas del adaptador con un pool simulado (la rama ya trae `test.rs`): redondeo entre dos dueños, retiro parcial y total, `valor`, errores.
- Si haces la bóveda por token: pruebas en `contracts/tanda/src/test_blend.rs` (ya declarado) con dos tokens y dos bóvedas, y `assert_conservacion()`.
- Las 16 pruebas originales y las de M1–M3 siguen en verde.
- Validación en testnet documentada (hashes de transacción).

## Coordinación

- **M1:** política de TTL y decisión sobre la bóveda simulada (acelerador).
- **Orquestador:** fecha de entrada (domingo 20:00 CR según el calendario) y despliegue final. Si Blend no queda sólido a tiempo, **no entra**. La demo usa la versión simulada y Blend se muestra con `scripts/demo_blend.sh` y transacciones reales en stellar.expert. Ten ese plan B documentado.

## Entregables

1. `docs/blend.md` con la auditoría y la recomendación (sábado).
2. Decisión de producto acordada con las personas (sábado).
3. Integración y despliegue (domingo, después de M1–M3).

Cumple la Definición de Terminado del protocolo antes de pedir revisión.
