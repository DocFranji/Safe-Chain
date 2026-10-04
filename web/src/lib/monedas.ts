// Monedas de las tandas (misión M4, docs/blend.md §6): cada tanda guarda su token y, con él, su bóveda.
// - TUSD: dinero de prueba propio; su garantía rinde en la bóveda simulada.
// - USDC de prueba de Blend: su garantía rinde DE VERDAD en el pool de Blend (adaptador de Blend).
// La web solo ofrece USDC si el contrato de la tanda tiene una bóveda registrada para él.
import { Address } from '@stellar/stellar-sdk'
import { SIMBOLO, TANDA_ID, TOKEN_ID, USDC_ID } from '../config'
import { monto } from './formato'
import { simular } from './rpc'

export type Moneda = {
  token: string
  simbolo: string
  /** Para el selector al crear una tanda. */
  nombre: string
  /** true: su garantía rinde de verdad en Blend. false: rendimiento simulado. */
  real: boolean
}

export const TUSD: Moneda = { token: TOKEN_ID, simbolo: SIMBOLO, nombre: 'TUSD de prueba', real: false }
export const USDC: Moneda | null = USDC_ID
  ? { token: USDC_ID, simbolo: 'USDC', nombre: 'USDC de prueba de Blend', real: true }
  : null

/** La moneda de una tanda, por su token. Un token desconocido se muestra con su dirección abreviada. */
export function monedaDe(token: string | undefined | null): Moneda {
  if (!token || token === TUSD.token) return TUSD
  if (USDC && token === USDC.token) return USDC
  return { token, simbolo: `${token.slice(0, 4)}…`, nombre: 'Otra moneda', real: false }
}

let usdcEnCache: Promise<boolean> | null = null

/**
 * ¿Se pueden crear tandas en USDC? Solo si el contrato de la tanda tiene una bóveda registrada para USDC
 * (`get_boveda_token`). Un contrato viejo, sin esa función, responde con error: cuenta como "no".
 */
export function usdcDisponible(): Promise<boolean> {
  if (!USDC) return Promise.resolve(false)
  const token = USDC.token
  usdcEnCache ??= simular(TANDA_ID, 'get_boveda_token', [new Address(token).toScVal()])
    .then((v) => typeof v === 'string' && v.length > 0)
    .catch(() => false)
  return usdcEnCache
}

/** Las monedas que se pueden elegir al crear una tanda. */
export async function monedasDisponibles(): Promise<Moneda[]> {
  return USDC && (await usdcDisponible()) ? [TUSD, USDC] : [TUSD]
}

/**
 * Como `monto`, pero sin esconder los montos muy chicos: el rendimiento real de Blend en minutos son
 * centavos de centavo y con 2 decimales se vería "+0". 39n -> "0,0000039" · 1_234_567n -> "0,12".
 */
export function montoFino(valor: bigint): string {
  const abs = valor < 0n ? -valor : valor
  if (abs === 0n || abs >= 100_000n) return monto(valor)
  const texto = `0,${String(abs).padStart(7, '0').replace(/0+$/, '')}`
  return valor < 0n ? `−${texto}` : texto
}
