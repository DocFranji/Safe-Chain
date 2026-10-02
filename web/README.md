# Tanda: interfaz web

React + TypeScript + Vite. Habla con el contrato de la tanda en Stellar testnet y firma con la billetera Freighter.

## Correrla

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Necesitas la extensión [Freighter](https://freighter.app) en modo **Testnet**. Sin billetera igual puedes ver las tandas; para crear, unirte o pagar hay que conectarla.

Otros comandos:

| Comando | Qué hace |
| --- | --- |
| `npm test` | Pruebas de la lógica (colateral, montos, rutas). Los números salen de las pruebas de Rust |
| `npm run lint` | Revisa el código |
| `npm run build` | Compila para producción en `dist/` |

## Qué puede hacer

| Pantalla | Ruta | Qué hay |
| --- | --- | --- |
| Lobby | `#/` | Todas las tandas, con filtros (abiertas, en curso, terminadas, mías) |
| Crear tanda | `#/crear` | Formulario con ejemplos y vista previa de la garantía de cada turno, la bolsa, la duración y el riesgo del grupo |
| Una tanda | `#/tanda/N` | Rueda de turnos, acciones (unirse, pagar, cerrar ronda, repartir, cancelar), invitación por link o WhatsApp, rendimiento en vivo y resultados finales |

Además, una barra bajo el encabezado guía a una cuenta nueva: activarla con Friendbot, aceptar TUSD (trustline) y pedir TUSD de prueba al faucet. Muestra el saldo y evita pedir una firma que va a fallar por falta de fondos.

## Configuración

Las direcciones de los contratos están en `src/config.ts`. Si vuelven a desplegar, cámbienlas ahí o creen `web/.env` (tiene prioridad). Ver `.env.example`.

| Variable | Para qué |
| --- | --- |
| `VITE_TANDA_ID` | Contrato de la tanda (está en `scripts/.contratos`) |
| `VITE_TOKEN_ID` | Contrato del token TUSD |
| `VITE_RPC_URL`, `VITE_HORIZON_URL` | Servidores de Stellar (por defecto, los públicos de testnet) |
| `VITE_FAUCET_URL` | Dónde está el faucet. Por defecto `/api/faucet`. Vacío = sin botón de faucet |
| `VITE_BOVEDA_SIMULADA` | Pónganla en `false` cuando cambien la bóveda simulada por Blend |

La dirección de la bóveda **no** hace falta: la web la lee del almacenamiento del contrato de la tanda.

## Faucet de TUSD (opcional)

`api/faucet.ts` es una función serverless (formato de Vercel) que envía TUSD de prueba desde la cuenta emisora. Solo sirve en testnet.

1. Importen el repositorio en Vercel con **Root Directory = `web`**.
2. En *Settings → Environment Variables* agreguen (nunca en el código ni en un archivo que se suba):
   - `FAUCET_ISSUER_SECRET`: la llave secreta de la cuenta emisora. Se obtiene con `stellar keys show emisor`.
   - Opcionales: `FAUCET_ASSET_CODE` (TUSD), `FAUCET_AMOUNT` (1000), `FAUCET_MAX_BALANCE` (5000).
3. Despliegan. Quien ya tenga `FAUCET_MAX_BALANCE` o más no recibe, para que no se pueda vaciar pidiendo en bucle.

Con `npm run dev` el faucet no existe y la web lo avisa. Para probarlo en local usen `vercel dev`, con las variables en `web/.env.local` (ese archivo no se sube).

Sin faucet, se puede dar TUSD con `stellar contract invoke ... mint` (ver `scripts/desplegar_testnet.sh`).

## Cómo está organizado

```
src/
  pages/        Lobby, CrearTanda, PaginaTanda
  components/   Rueda, PanelRonda, ListaMiembros, Invitar, Rendimiento, Resultados, BarraCuenta...
  hooks/        useBilletera (Freighter), useTanda, useTandas, useCuenta, useRuta
  lib/          contrato.ts (llamadas y errores en español), lectura.ts, rpc.ts, cuenta.ts,
                colateral.ts (replica las reglas del contrato), rutas.ts, formato.ts
api/faucet.ts   Faucet serverless
packages/tanda  Cliente TypeScript del contrato (lo genera `stellar contract bindings`; no se edita a mano)
```

Detalles útiles:

- **`lib/colateral.ts` replica las reglas de `contracts/tanda/src/lib.rs`** para la vista previa. Si cambian el contrato, cambien también ese archivo; `colateral.test.ts` usa los mismos números que las pruebas de Rust.
- **Resultados finales:** el contrato no guarda cuánto recibió cada persona, solo lo anuncia con eventos (`liquidado`, `finalizada`). La web los lee del RPC, que los conserva unos días. Pasado ese tiempo la pantalla lo explica.
- **Rutas con `#`:** funcionan en cualquier hosting estático. El link de invitación es `https://tu-sitio/#/tanda/3`.
- **Si regeneran el cliente** (`stellar contract bindings typescript ...`), el lint ignora `packages/` a propósito.

## Qué no está probado

Las lecturas, la interfaz y los cálculos están verificados con un RPC simulado. Los flujos que **firman** (crear, unirse, pagar, cancelar, aceptar TUSD) necesitan Freighter y testnet reales: pruébenlos de punta a punta antes de la demo.
