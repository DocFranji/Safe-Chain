# Tanda On-Chain con Blend (rendimiento real)


Hay dos tandas que conviven en testnet:

| Versión | Token | Dónde está el colateral | Para qué sirve |
| --- | --- | --- | --- |
| Original | TUSD | Bóveda simulada (rendimiento acelerado) | Demo principal, segura y predecible |
| Con Blend | XLM | Pool real **TestnetV2** de Blend | Mostrar rendimiento real del ecosistema Stellar |

**Por qué XLM:** el pool de Blend no acepta nuestro TUSD, y su USDC de prueba no tiene un faucet público. El XLM de testnet es gratis (Friendbot) y Blend lo acepta.

**Viabilidad probada a mano en testnet (1 oct 2026):**

- `get_reserve` del pool respondió bien.
- Depositar 100 XLM → recibimos 455 718 653 bTokens.
- Retirar 100 XLM → sobraron 11 567 bTokens: el interés ganado en esos minutos.

**El contrato de la tanda no cambió ni una línea:** solo se inicializa una tanda nueva con el adaptador como `boveda`.

```bash
bash scripts/desplegar_blend.sh   # adaptador + tanda nueva -> scripts/.contratos_blend
bash scripts/demo_blend.sh        # misma demo, con el colateral en Blend
```

**Cómo funciona el adaptador:**

- **Es el "usuario" de Blend:** todo el colateral queda a su nombre. Por dentro lleva la cuenta de cuántos bTokens le corresponden a cada tanda.
- **Para depositar** usa `submit_with_allowance` (request_type 0). **Para retirar** usa `submit` (request_type 1), con el dinero yendo directo a la tanda.
- **El valor de los bTokens** sale del `b_rate` de `get_reserve`, que tiene 12 decimales. Lo lee campo por campo, para no romperse si Blend agrega campos.
- **Redondea igual que Blend** (bTokens hacia abajo al depositar, hacia arriba al retirar). Así una tanda nunca puede gastar bTokens de otra.

**Riesgo conocido:** si el pool está casi 100% prestado, un retiro grande puede fallar por falta de liquidez. Al momento de la prueba estaba al ~92%. Para producción conviene dejar parte del colateral fuera de Blend.

**La web (por ahora) sigue con la tanda de TUSD.** Está pensada alrededor de TUSD: revisa la trustline en Horizon, usa el faucet de `web/api/faucet.ts` y muestra `SIMBOLO = 'TUSD'` en `web/src/config.ts`. Apuntarla a la tanda de Blend en XLM requeriría varias cosas:

1. `VITE_TANDA_ID=<TANDA_BLEND>` y `VITE_TOKEN_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.
2. Que `SIMBOLO` sea configurable ("XLM").
3. Saltarse la trustline y el faucet cuando el token es XLM nativo, porque el XLM no los necesita.
4. `VITE_BOVEDA_SIMULADA=false`, para que la web deje de avisar que el rendimiento es simulado.

Para la demo del hackathon, la versión con Blend se muestra con `scripts/demo_blend.sh` y sus transacciones en stellar.expert.
