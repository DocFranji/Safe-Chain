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

/** El token de prueba tiene 7 decimales: 100 TUSD = 1_000_000_000. */
export const DECIMALES = 7n
export const SIMBOLO = 'TUSD'

/** Cada cuántos milisegundos se vuelve a leer la tanda desde la red. */
export const INTERVALO_LECTURA_MS = 5000

export const EXPLORADOR = 'https://stellar.expert/explorer/testnet'
