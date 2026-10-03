// Preparar una cuenta nueva para usar TUSD en testnet:
//   1) que exista (Friendbot le regala XLM para las comisiones),
//   2) que "acepte" TUSD (trustline: sin esto una cuenta normal G... no puede recibirlo),
//   3) que tenga saldo (faucet).
import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { signTransaction } from '@stellar/freighter-api'
import { FAUCET_URL, FRIENDBOT_URL, HORIZON_URL, NETWORK_PASSPHRASE } from '../config'
import { activoToken } from './rpc'

export type EstadoCuenta = { existe: boolean; trustline: boolean }

/** Un error cuyo mensaje ya está redactado para la persona: se muestra tal cual. */
export class ErrorAmigable extends Error {}

const horizon = () => new Horizon.Server(HORIZON_URL)

function esNoEncontrada(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const r = (e as { response?: { status?: number }; name?: string })
  return r.response?.status === 404 || r.name === 'NotFoundError'
}

/** ¿La cuenta existe en testnet y ya aceptó TUSD? */
export async function leerCuenta(direccion: string): Promise<EstadoCuenta> {
  const { codigo, emisor } = await activoToken()
  try {
    const cuenta = await horizon().loadAccount(direccion)
    const trustline = cuenta.balances.some(
      (b) => 'asset_code' in b && b.asset_code === codigo && b.asset_issuer === emisor,
    )
    return { existe: true, trustline }
  } catch (e) {
    if (esNoEncontrada(e)) return { existe: false, trustline: false }
    throw e
  }
}

/** Crea la cuenta en testnet y le da XLM de prueba. */
export async function activarConFriendbot(direccion: string): Promise<void> {
  const r = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(direccion)}`)
  if (!r.ok) throw new ErrorAmigable('Friendbot no pudo activar la cuenta. Intenta de nuevo en un momento.')
}

/** Le pide a Freighter que firme la aceptación de TUSD y la envía a la red. */
export async function aceptarTusd(direccion: string): Promise<void> {
  const { codigo, emisor } = await activoToken()
  const cuenta = await horizon().loadAccount(direccion)
  const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: new Asset(codigo, emisor) }))
    .setTimeout(60)
    .build()
  const firmada = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE, address: direccion })
  if (firmada.error) throw new ErrorAmigable(firmada.error.message || 'Se canceló la firma en Freighter.')
  await horizon().submitTransaction(TransactionBuilder.fromXDR(firmada.signedTxXdr, NETWORK_PASSPHRASE))
}

/** Pide TUSD de prueba al faucet. Lanza un Error con un mensaje listo para mostrar. */
export async function pedirFaucet(direccion: string): Promise<void> {
  if (!FAUCET_URL) throw new ErrorAmigable('El faucet no está activado en esta versión de la web.')
  let respuesta: Response
  try {
    respuesta = await fetch(FAUCET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: direccion }),
    })
  } catch {
    throw new ErrorAmigable('No pudimos contactar al faucet. Revisa tu conexión.')
  }
  const datos: unknown = await respuesta.json().catch(() => null)
  const ok = typeof datos === 'object' && datos !== null && (datos as { ok?: unknown }).ok === true
  if (ok) return
  const mensaje = typeof datos === 'object' && datos !== null ? (datos as { error?: unknown }).error : undefined
  // Sin JSON válido casi siempre significa que el sitio no tiene la función del faucet (por ejemplo, `npm run dev`).
  throw new ErrorAmigable(typeof mensaje === 'string' ? mensaje : 'El faucet no está disponible en este entorno.')
}
