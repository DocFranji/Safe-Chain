// Faucet de TUSD de prueba. Es una función serverless (Vercel): se despliega junto con la web
// y responde en POST /api/faucet.
//
// SOLO PARA TESTNET: usa la llave secreta del emisor de TUSD para enviar dinero de mentira.
// Nunca pongan aquí (ni en el repositorio) una llave que controle fondos reales.
//
// Variables de entorno (en el panel de Vercel, NO en el código):
//   FAUCET_ISSUER_SECRET   llave secreta (S...) de la cuenta emisora. Se obtiene con:  stellar keys show emisor
//   FAUCET_ASSET_CODE      código del activo (por defecto TUSD)
//   FAUCET_AMOUNT          cuánto entrega cada vez (por defecto 1000)
//   FAUCET_MAX_BALANCE     si la cuenta ya tiene esto o más, no entrega (por defecto 5000)
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk'

type Peticion = { method?: string; body?: unknown }
type Respuesta = {
  status(codigo: number): Respuesta
  json(cuerpo: unknown): void
  setHeader(nombre: string, valor: string): void
}

const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org'

function numero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : porDefecto
}

export default async function handler(req: Peticion, res: Respuesta) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Usa POST.' })
  }

  const secreto = process.env.FAUCET_ISSUER_SECRET
  if (!secreto) {
    return res.status(503).json({ ok: false, error: 'El faucet no está configurado todavía.' })
  }

  // El cuerpo puede llegar ya convertido (objeto) o como texto, según el hosting.
  const cuerpo = typeof req.body === 'string' ? safeJson(req.body) : req.body
  const direccion = (cuerpo as { address?: unknown } | null)?.address
  if (typeof direccion !== 'string' || !StrKey.isValidEd25519PublicKey(direccion)) {
    return res.status(400).json({ ok: false, error: 'La dirección de la billetera no es válida.' })
  }

  const codigo = process.env.FAUCET_ASSET_CODE ?? 'TUSD'
  const monto = numero(process.env.FAUCET_AMOUNT, 1000)
  const tope = numero(process.env.FAUCET_MAX_BALANCE, 5000)

  try {
    const emisor = Keypair.fromSecret(secreto)
    const activo = new Asset(codigo, emisor.publicKey())
    const horizon = new Horizon.Server(HORIZON_URL)

    let cuenta
    try {
      cuenta = await horizon.loadAccount(direccion)
    } catch {
      return res.status(400).json({ ok: false, error: 'Tu cuenta todavía no existe en testnet. Actívala primero con Friendbot.' })
    }

    const linea = cuenta.balances.find((b) => 'asset_code' in b && b.asset_code === codigo && b.asset_issuer === emisor.publicKey())
    if (!linea) {
      return res.status(400).json({ ok: false, error: `Primero acepta ${codigo} en tu cuenta.` })
    }
    if (Number(linea.balance) >= tope) {
      return res.status(429).json({ ok: false, error: `Ya tienes suficiente ${codigo} de prueba (${linea.balance}).` })
    }

    const origen = await horizon.loadAccount(emisor.publicKey())
    const tx = new TransactionBuilder(origen, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: direccion, asset: activo, amount: monto.toFixed(7) }))
      .setTimeout(30)
      .build()
    tx.sign(emisor)
    await horizon.submitTransaction(tx)

    return res.status(200).json({ ok: true, monto })
  } catch (e) {
    console.error('faucet:', e)
    return res.status(502).json({ ok: false, error: 'No pudimos enviar el TUSD ahora mismo. Intenta de nuevo en un momento.' })
  }
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}
