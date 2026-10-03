// Configuración de la red y de los contratos.
// Si vuelven a desplegar, cambien las direcciones aquí abajo (o pónganlas en web/.env,
// que tiene prioridad: VITE_TANDA_ID=... y VITE_TOKEN_ID=...). Están en scripts/.contratos.
import { Networks } from '@stellar/stellar-sdk'

export const RPC_URL: string = import.meta.env.VITE_RPC_URL ?? 'https://soroban-testnet.stellar.org'
export const NETWORK_PASSPHRASE: string = Networks.TESTNET
export const TANDA_ID: string =
  import.meta.env.VITE_TANDA_ID ?? 'CDLSK5Z65A645XS5X6IMJAUOYBLXZFLP7SNM3DB62LFQKFUKNDCKKEGV'
export const TOKEN_ID: string =
  import.meta.env.VITE_TOKEN_ID ?? 'CDM2YCJVE37HUCNOY5E65NOEKTQVQM2WD6CUVHSL5WZFVISPIUIYHAQ5'

/** Horizon: servicio que lee cuentas clásicas (G...), por ejemplo para saber si aceptaron TUSD. */
export const HORIZON_URL: string = import.meta.env.VITE_HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
export const FRIENDBOT_URL = 'https://friendbot.stellar.org'

/**
 * Dirección del faucet que regala TUSD de prueba (web/api/faucet.ts, una función serverless).
 * Por defecto es la ruta /api/faucet del mismo sitio. Para desactivar el botón: VITE_FAUCET_URL= (vacío).
 */
export const FAUCET_URL: string | null = (import.meta.env.VITE_FAUCET_URL ?? '/api/faucet') || null

/** El token de prueba tiene 7 decimales: 100 TUSD = 1_000_000_000. */
export const DECIMALES = 7n
export const SIMBOLO = 'TUSD'

/**
 * true mientras la bóveda sea la simulada (contracts/boveda_simulada). Cuando la cambien por
 * un adaptador a Blend, pónganlo en false (o VITE_BOVEDA_SIMULADA=false) y la web deja de avisarlo.
 */
export const BOVEDA_SIMULADA: boolean = import.meta.env.VITE_BOVEDA_SIMULADA !== 'false'

/** Cada cuántos milisegundos se vuelve a leer la tanda desde la red. */
export const INTERVALO_LECTURA_MS = 5000

export const EXPLORADOR = 'https://stellar.expert/explorer/testnet'
