# Pruebas de navegador (e2e)

Abren la web en un Chromium de verdad, pero con **Stellar simulado**: RPC de Soroban, Horizon, Friendbot, el faucet y la extensión Freighter responden desde `mock.mjs`, sin red. Así se prueban la interfaz y los flujos completos en segundos y sin gastar nada.

## Cómo correrlas

```bash
cd web && npm run build && npm run preview     # sirve la web en http://localhost:4173
# en otra terminal:
cd web/e2e && npm install && npm test          # ~100 comprobaciones; capturas en e2e/shots/
```

- `BASE=http://localhost:5173/ npm test`: probar contra otro servidor (por ejemplo, `npm run dev`).
- `CHROMIUM_PATH=/ruta/a/chrome npm test`: usar otro Chromium. En las sesiones de Claude Code en la nube ya hay uno en `/opt/pw-browsers/chromium`; en tu PC instala uno con `npx playwright install chromium`.
- `node snap.mjs "#/tanda/2" nombre 390`: captura de una página a 390 px de ancho (`me` = con billetera conectada, `none` = sin billetera).

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `mock.mjs` | Estado simulado (5 tandas de ejemplo, cuentas de Ana, Beto, Carla y "yo") y respuestas del RPC. Codifica las respuestas con el **mismo spec del contrato** que usa la web (`../packages/tanda`) |
| `helpers.mjs` | `nuevaPagina()`: abre una pestaña con todo simulado. `opcionesNavegador()` y `BASE_URL` |
| `run.mjs` | Los escenarios y sus comprobaciones (`check(nombre, condición)`) |
| `snap.mjs` | Capturas sueltas |

## Si cambias el contrato

Después de regenerar el cliente (`bash scripts/generar_cliente.sh`):

1. Actualiza en `mock.mjs` los datos de ejemplo (`tanda()`, `miembro()`, `nuevoEstado()`) si agregaste campos a `Tanda` o `Miembro`.
2. Si agregaste **consultas** nuevas (`get_*`), agrega su respuesta en `respuestaRpc` (busca cómo responde `get_tanda`).
3. Si agregaste **eventos**, agrégalos donde se arman los eventos simulados para que la línea de tiempo los muestre.
4. Agrega escenarios en `run.mjs` para lo tuyo: crear, unirse, pagar, la pantalla nueva y la vista a 390 px.

## Limitación importante

El RPC simulado responde lecturas y simulaciones (`simulateTransaction`, `getEvents`, `getLedgerEntries`...), pero **no envía transacciones**: no implementa `sendTransaction` ni `getTransaction`. Las pruebas cubren las pantallas, las lecturas y todo lo que pasa **antes** de firmar (montos, validaciones, botones, confirmaciones), no el resultado de una firma. Para probar el flujo completo:

- agrega `sendTransaction` y `getTransaction` en `respuestaRpc` (y actualiza el estado simulado como lo haría el contrato), o
- pruébalo de verdad en testnet con un contrato desplegado para pruebas.
