# Tanda: interfaz web

React + TypeScript + Vite. Habla con el contrato de la tanda en Stellar testnet y firma con la billetera Freighter.

## Correrla

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Para crear, unirte o pagar hay que entrar de una de dos formas:

- **Con Google** (si configuraron `VITE_PRIVY_APP_ID`, ver abajo): se crea una billetera Stellar para esa cuenta, sin instalar nada.
- **Con la extensión [Freighter](https://freighter.app)** en modo **Testnet**.

Sin entrar igual puedes ver las tandas.

Otros comandos:

| Comando | Qué hace |
| --- | --- |
| `npm test` | Pruebas de la lógica (colateral, montos, rutas). Los números salen de las pruebas de Rust |
| `npm run lint` | Revisa el código |
| `npm run build` | Compila para producción en `dist/` |

## Qué puede hacer

| Pantalla | Ruta | Qué hay |
| --- | --- | --- |
| Inicio (landing) | `#/` | Presentación de Rounda: cómo funciona y por qué es segura. Los botones abren la app (`#/tandas`) o la demo. Sin contraseñas: se entra con Google o con Freighter |
| Lobby | `#/tandas` | Todas las tandas, con filtros (abiertas, en curso, terminadas, mías) |
| Crear tanda | `#/crear` | Formulario con ejemplos y vista previa de la garantía de cada turno, la bolsa, la duración y el riesgo del grupo |
| Una tanda | `#/tanda/N` | Rueda de turnos, acciones (unirse, pagar, cerrar ronda, repartir, cancelar), invitación por link o WhatsApp, rendimiento en vivo y resultados finales |
| Demo en vivo | `#/demo` o `#/demo/N` | Vista **para proyectar**, sin billetera: reloj grande, una tarjeta por persona con su garantía y una línea de tiempo narrada con los momentos clave resaltados. Con `#/demo/N` se queda fija en la tanda N |
| Estado | `#/estado` | Chequeo previo a la demo: RPC, contrato, bóveda y su saldo, token y faucet, con qué hacer si algo falla |

Además, una barra bajo el encabezado guía a una cuenta nueva: activarla con Friendbot, aceptar TUSD (trustline) y pedir TUSD de prueba al faucet. Muestra el saldo y evita pedir una firma que va a fallar por falta de fondos.

## Configuración

Las direcciones de los contratos están en `src/config.ts`. Si vuelven a desplegar, cámbienlas ahí o creen `web/.env` (tiene prioridad). Ver `.env.example`.

| Variable | Para qué |
| --- | --- |
| `VITE_TANDA_ID` | Contrato de la tanda (está en `scripts/.contratos`) |
| `VITE_TOKEN_ID` | Contrato del token TUSD |
| `VITE_RPC_URL`, `VITE_HORIZON_URL` | Servidores de Stellar (por defecto, los públicos de testnet) |
| `VITE_PRIVY_APP_ID` | App ID de Privy para **entrar con Google**. Vacío = solo Freighter |
| `VITE_FAUCET_URL` | Dónde está el faucet. Por defecto `/api/faucet`. Vacío = sin botón de faucet |
| `VITE_NOMBRES` | JSON `{"G...":"Ana", ...}` para mostrar nombres en lugar de direcciones. Lo escribe `scripts/desplegar_testnet.sh` |
| `VITE_BOVEDA_SIMULADA` | Pónganla en `false` cuando cambien la bóveda simulada por Blend |

La dirección de la bóveda **no** hace falta: la web la lee del almacenamiento del contrato de la tanda.

## Entrar con Google (Privy, opcional)

Con Google, [Privy](https://privy.io) le crea a cada persona una billetera Stellar. La llave la guarda Privy; la app le pide firmar el *hash* de cada transacción (`src/lib/firmante.ts`) y el resto funciona igual que con Freighter.

1. Creen una app en [dashboard.privy.io](https://dashboard.privy.io) y activen **Google** como método de login.
2. En la configuración de dominios permitidos agreguen `http://localhost:5173` y el dominio de Vercel.
3. Pongan el App ID en `web/.env` (`VITE_PRIVY_APP_ID=...`) y en Vercel (*Settings → Environment Variables*). No es secreto.

Sin esa variable la web no carga Privy y funciona solo con Freighter.

Archivos: `src/cuentas/SesionGooglePrivy.tsx` (sesión y creación de la billetera), `src/cuentas/sesionGoogle.ts` (estado compartido), `src/lib/firmante.ts` (Freighter o Privy, según quién entró).

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
  hooks/        useBilletera (Google o Freighter), useTanda, useTandas, useCuenta, useRuta
  cuentas/      Entrar con Google (Privy)
  lib/          contrato.ts (llamadas y errores en español), firmante.ts, lectura.ts, rpc.ts, cuenta.ts,
                colateral.ts (replica las reglas del contrato), rutas.ts, formato.ts
api/faucet.ts   Faucet serverless
packages/tanda  Cliente TypeScript del contrato (lo genera `stellar contract bindings`; no se edita a mano)
```

Detalles útiles:

- **`lib/colateral.ts` replica las reglas de `contracts/tanda/src/lib.rs`** para la vista previa. Si cambian el contrato, cambien también ese archivo; `colateral.test.ts` usa los mismos números que las pruebas de Rust.
- **Línea de tiempo y resultados:** salen de los eventos del contrato. Se lee un solo flujo por tanda (`lib/rpc.ts: leerEventos`) y `lib/historia.ts` los convierte en frases.
- **Resultados finales:** el contrato no guarda cuánto recibió cada persona, solo lo anuncia con eventos (`liquidado`, `finalizada`). La web los lee del RPC, que los conserva unos días. Pasado ese tiempo la pantalla lo explica.
- **Diseño:** la landing está en `src/landing/` (sus estilos viven bajo `.ln` para no chocar con la app). El resto de la app usa los colores de `src/index.css` (variables `--papel`, `--acento`, etc.): para cambiar la paleta basta con editar ahí. El texto cumple contraste AA y los bordes de campos y botones pasan 3:1.
- **Rutas con `#`:** funcionan en cualquier hosting estático. El link de invitación es `https://tu-sitio/#/tanda/3`.
- **Si regeneran el cliente** (`stellar contract bindings typescript ...`), el lint ignora `packages/` a propósito.

## Qué no está probado

Las lecturas, la interfaz y los cálculos están verificados con un RPC simulado. Los flujos que **firman** (crear, unirse, pagar, cancelar, aceptar TUSD) necesitan Freighter y testnet reales: pruébenlos de punta a punta antes de la demo.
