// La cuenta de la persona en USDC de prueba de Blend (misión M4).
// USDC es un activo "clásico" de Stellar: para recibirlo, la cuenta tiene que aceptarlo (trustline). El faucet
// de Blend hace las dos cosas en UNA transacción (acepta el activo y entrega 1 000 USDC); la persona solo firma.
// Ver web/api/faucet-blend.ts (revisa la transacción antes de dártela) y docs/blend.md §4.
import { Horizon, TransactionBuilder } from '@stellar/stellar-sdk'
import { FAUCET_BLEND_URL, HORIZON_URL, NETWORK_PASSPHRASE, USDC_EMISOR } from '../config'
import { ErrorAmigable } from './cuenta'
import { firmarTransaccion } from './firmante'

export type CuentaUsdc = { trustline: boolean; saldo: bigint }

type Linea = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }

/** "1000.0000000" -> 10_000_000_000n (7 decimales, sin pasar por números de coma flotante). */
export function aUnidades(balance: string): bigint {
  const [entero, decimales = ''] = balance.split('.')
  return BigInt(entero) * 10_000_000n + BigInt((decimales + '0000000').slice(0, 7))
}

/** De los saldos de Horizon: ¿acepta USDC de Blend?, ¿cuánto tiene? */
export function usdcDeSaldos(balances: Linea[], emisor = USDC_EMISOR): CuentaUsdc {
  const linea = balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === emisor)
  return linea ? { trustline: true, saldo: aUnidades(linea.balance) } : { trustline: false, saldo: 0n }
}

/** Lee la cuenta en Horizon. Una cuenta que todavía no existe no tiene USDC. */
export async function leerUsdc(direccion: string): Promise<CuentaUsdc> {
  try {
    const cuenta = await new Horizon.Server(HORIZON_URL).loadAccount(direccion)
    return usdcDeSaldos(cuenta.balances as Linea[])
  } catch (e) {
    const r = e as { response?: { status?: number }; name?: string }
    if (r?.response?.status === 404 || r?.name === 'NotFoundError') return { trustline: false, saldo: 0n }
    throw e
  }
}

/**
 * Pide USDC de prueba al faucet de Blend: la función de Vercel devuelve la transacción ya revisada, la
 * persona la firma (Freighter o Google) y la enviamos. Devuelve lo que recibió, para contarlo.
 */
export async function pedirUsdcBlend(direccion: string): Promise<{ codigo: string; monto: string }[]> {
  if (!FAUCET_BLEND_URL) throw new ErrorAmigable('El faucet de USDC no está activado en esta versión de la web.')
  let respuesta: Response
  try {
    respuesta = await fetch(FAUCET_BLEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: direccion }),
    })
  } catch {
    throw new ErrorAmigable('No pudimos contactar al faucet de Blend. Revisa tu conexión.')
  }
  const datos = (await respuesta.json().catch(() => null)) as
    | { ok?: boolean; xdr?: string; recibe?: { codigo: string; monto: string }[]; error?: string }
    | null
  if (!datos?.ok || !datos.xdr) {
    throw new ErrorAmigable(datos?.error ?? 'El faucet de USDC no está disponible en este entorno.')
  }
  const firmada = await firmarTransaccion(datos.xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: direccion })
  if (firmada.error) throw new ErrorAmigable(firmada.error.message || 'Se canceló la firma.')
  await new Horizon.Server(HORIZON_URL).submitTransaction(TransactionBuilder.fromXDR(firmada.signedTxXdr, NETWORK_PASSPHRASE))
  return datos.recibe ?? []
}
