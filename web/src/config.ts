// Configuración de la red y de los contratos.
// Si vuelven a desplegar, cambien las direcciones aquí abajo (o pónganlas en web/.env,
// que tiene prioridad: VITE_TANDA_ID=... y VITE_TOKEN_ID=...). Están en scripts/.contratos.
import { Networks } from '@stellar/stellar-sdk'

export const RPC_URL: string = import.meta.env.VITE_RPC_URL ?? 'https://soroban-testnet.stellar.org'
export const NETWORK_PASSPHRASE: string = Networks.TESTNET
export const TANDA_ID: string =
  import.meta.env.VITE_TANDA_ID ?? 'CADFZFJDRFSM4WT6VO3F4IXM2Z4ZKKD3VLOELAMJMUFDCXZ2I2E3BYMC'
export const TOKEN_ID: string =
  import.meta.env.VITE_TOKEN_ID ?? 'CDM2YCJVE37HUCNOY5E65NOEKTQVQM2WD6CUVHSL5WZFVISPIUIYHAQ5'

/**
 * Contrato del historial crediticio (misión M2). Opcional: si está vacío, la web le pregunta al contrato
 * de la tanda cuál tiene configurado (`get_historial`); si tampoco hay, esconde todo lo del historial.
 */
export const HISTORIAL_ID: string = import.meta.env.VITE_HISTORIAL_ID ?? ''

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

/**
 * Entrar con Google (Privy). Es el "App ID" de dashboard.privy.io; va en web/.env y en Vercel como VITE_PRIVY_APP_ID.
 * No es secreto (viaja al navegador). Si está vacío, la web funciona como antes: solo con Freighter.
 */
export const PRIVY_APP_ID: string = import.meta.env.VITE_PRIVY_APP_ID ?? ''

// --- M4: USDC de prueba de Blend (rendimiento real; docs/blend.md) ---

/**
 * Contrato (SAC) del USDC de prueba de Blend en testnet. La web solo ofrece USDC si además el contrato de
 * la tanda tiene una bóveda registrada para él (`get_boveda_token`). Vacío (VITE_USDC_ID=) = sin USDC.
 */
export const USDC_ID: string = import.meta.env.VITE_USDC_ID ?? 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU'
/** Cuenta que emite el USDC de prueba de Blend (para leer el saldo en Horizon). */
export const USDC_EMISOR = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56'
/** Función de Vercel que pide USDC al faucet público de Blend (web/api/faucet-blend.ts). Vacío = sin botón. */
export const FAUCET_BLEND_URL: string | null = (import.meta.env.VITE_FAUCET_BLEND_URL ?? '/api/faucet-blend') || null
