# Tanda On-Chain con Blend (rendimiento real)

Hoy el colateral de las tandas rinde en una **bóveda simulada** (rendimiento acelerado para la demo).
Con el **adaptador de Blend** (`contracts/adaptador_blend`), el colateral se deposita en el pool real
**TestnetV2** de Blend, el protocolo de préstamos de Stellar, y gana intereses de verdad.

La auditoría completa, los riesgos y la recomendación de producto están en
[`docs/blend.md`](docs/blend.md).

| Versión | Activo | Dónde está el colateral | Para qué sirve |
| --- | --- | --- | --- |
| Original | TUSD | Bóveda simulada (acelerada) | Demo principal: rendimiento grande y predecible |
| Con Blend | **USDC de prueba de Blend** | Pool TestnetV2 de Blend | Tanda en dólares con rendimiento **real** |
| Con Blend | XLM | Pool TestnetV2 de Blend | Lo más simple de probar (Friendbot), rendimiento real |

**El contrato de la tanda no cambia:** se inicializa una tanda con el adaptador como `boveda`.

```bash
# XLM (las cuentas se fondean con Friendbot)
bash scripts/desplegar_blend.sh && bash scripts/demo_blend.sh

# USDC de prueba de Blend (cada miembro pide antes su USDC al faucet de Blend: docs/blend.md §4)
ACTIVO=usdc bash scripts/desplegar_blend.sh && ACTIVO=usdc bash scripts/demo_blend.sh
```

Variables de `demo_blend.sh`: `ADMIN`, `MIEMBROS="ana beto carla"`, `CUOTA`, `PERIODO`.

**Probado en testnet** (1 y 3 oct 2026): tanda completa con XLM y con USDC, y el peor caso de 12
miembros (12 retiros de Blend en un solo `cerrar_ronda`: 39 M instrucciones de 400 M; `finalizar`: 10 M). Hashes en
`docs/blend.md` §3.

**Cómo funciona el adaptador:**

- **Es el "usuario" de Blend:** todo el colateral queda a su nombre. Por dentro lleva la cuenta exacta
  de cuántos bTokens le corresponden a cada dueño (cada contrato de tanda).
- **Para depositar** usa `submit_with_allowance` (request_type 0). **Para retirar** usa `submit`
  (request_type 1), con el dinero yendo directo a la tanda.
- **Mide** los bTokens que Blend acuña o quema (posición antes y después) en vez de suponerlos, y se
  revierte si algo no cuadra. Así una tanda nunca puede gastar bTokens de otro dueño.
- **El valor de los bTokens** sale del `b_rate` de `get_reserve` (12 decimales), que Blend calcula al
  día en cada lectura.

**Rendimiento real (medido el 3 oct):** XLM ≈ 179 % anual (pool prestado al 92 %), USDC ≈ 2,2 % anual.
En los minutos de una demo es pequeño (≈ 0,0009 XLM en 8 minutos sobre 40 XLM): es real, y hay que
contarlo así.

**Riesgos conocidos** (detalle en `docs/blend.md`): si el pool se queda sin liquidez, cerrar una ronda
con impagos o finalizar fallan **sin perder dinero** hasta que vuelva la liquidez; con el pool
congelado nadie puede unirse a tandas nuevas, pero las que están en curso terminan bien.
