// Faucet de USDC de prueba de BLEND. Es una función serverless (Vercel): responde en POST /api/faucet-blend.
//
// Blend tiene un faucet público para testnet (lo usa su web, testnet.blend.capital): devuelve una transacción
// YA FIRMADA por su emisor que crea las trustlines y entrega 1 000 USDC (más BLND, wETH y wBTC). La cuenta solo
// agrega su firma. Su CORS solo acepta la web de Blend, por eso la pedimos desde aquí.
//
// No usa ningún secreto: solo reenvía la transacción. Pero antes la REVISA, porque la persona la va a firmar:
// solo se aceptan trustlines de la propia cuenta y pagos del emisor de Blend hacia ella. Ver docs/blend.md §4.
import { Asset, Networks, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'

type Peticion = { method?: string; body?: unknown }
type Respuesta = {
  status(codigo: number): Respuesta
  json(cuerpo: unknown): void
  setHeader(nombre: string, valor: string): void
}

const FAUCET_BLEND = process.env.FAUCET_BLEND_URL ?? 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets'
const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org'

/** Emisor de los activos de prueba de Blend en testnet (USDC, BLND, wETH, wBTC). */
export const EMISOR_BLEND = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56'

export type Recibe = { codigo: string; monto: string }
export type Revision = { ok: true; recibe: Recibe[] } | { ok: false; error: string }

/**
 * Revisa que la transacción del faucet sea segura de firmar para `direccion`:
 * - la paga y la firma el emisor de Blend (la persona no paga comisión ni presta su cuenta como origen);
 * - las operaciones a nombre de la persona son SOLO "aceptar un activo del emisor de Blend" (trustline);
 * - las demás son pagos del emisor de Blend HACIA la persona.
 * Cualquier otra cosa se rechaza.
 */
export function revisarTransaccion(tx: Transaction, direccion: string): Revision {
  if (tx.networkPassphrase !== Networks.TESTNET) return { ok: false, error: 'La transacción no es de testnet.' }
  if (tx.source !== EMISOR_BLEND) return { ok: false, error: 'La transacción no viene del faucet de Blend.' }
  if (tx.operations.length === 0) return { ok: false, error: 'YA_RECIBIO' }
  const recibe: Recibe[] = []
  for (const op of tx.operations) {
    const origen = op.source ?? tx.source
    if (op.type === 'changeTrust' && origen === direccion) {
      const linea = op.line
      if (!(linea instanceof Asset) || linea.isNative() || linea.getIssuer() !== EMISOR_BLEND) {
        return { ok: false, error: 'La transacción pide aceptar un activo desconocido.' }
      }
      continue
    }
    if (op.type === 'payment' && origen === EMISOR_BLEND && op.destination === direccion) {
      if (op.asset.isNative() || op.asset.getIssuer() !== EMISOR_BLEND) {
        return { ok: false, error: 'La transacción envía un activo desconocido.' }
      }
      recibe.push({ codigo: op.asset.getCode(), monto: op.amount })
      continue
    }
    return { ok: false, error: 'La transacción del faucet trae operaciones que no esperábamos.' }
  }
  return { ok: true, recibe }
}

export default async function handler(req: Peticion, res: Respuesta) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Usa POST.' })
  }

  // El cuerpo puede llegar ya convertido (objeto) o como texto, según el hosting.
  const cuerpo = typeof req.body === 'string' ? safeJson(req.body) : req.body
  const direccion = (cuerpo as { address?: unknown } | null)?.address
  if (typeof direccion !== 'string' || !StrKey.isValidEd25519PublicKey(direccion)) {
    return res.status(400).json({ ok: false, error: 'La dirección de la billetera no es válida.' })
  }

  try {
    const cuenta = await fetch(`${HORIZON_URL}/accounts/${direccion}`)
    if (cuenta.status === 404) {
      return res.status(400).json({ ok: false, error: 'Tu cuenta todavía no existe en testnet. Actívala primero con Friendbot.' })
    }

    const r = await fetch(`${FAUCET_BLEND}?userId=${encodeURIComponent(direccion)}`)
    if (!r.ok) throw new Error(`faucet de Blend respondió ${r.status}`)
    const crudo = (await r.text()).trim()
    // Blend la devuelve como texto JSON (entre comillas).
    const xdr = crudo.startsWith('"') ? (JSON.parse(crudo) as string) : crudo
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET)
    if (!(tx instanceof Transaction)) throw new Error('el faucet de Blend devolvió una transacción envuelta')

    const revision = revisarTransaccion(tx, direccion)
    if (!revision.ok) {
      if (revision.error === 'YA_RECIBIO') {
        return res.status(429).json({ ok: false, error: 'Esta cuenta ya recibió sus dólares de prueba de Blend.' })
      }
      console.error('faucet-blend: transacción rechazada:', revision.error)
      return res.status(502).json({ ok: false, error: revision.error })
    }
    return res.status(200).json({ ok: true, xdr, recibe: revision.recibe })
  } catch (e) {
    console.error('faucet-blend:', e)
    return res.status(502).json({ ok: false, error: 'El faucet de Blend no respondió. Intenta de nuevo en un momento.' })
  }
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}
