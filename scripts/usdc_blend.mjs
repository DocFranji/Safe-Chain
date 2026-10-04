// Pide USDC de prueba al faucet público de Blend para una cuenta de testnet y firma con su llave
// (misión M4, docs/blend.md §4). Lo usan desplegar_testnet.sh y demo_blend.sh para las cuentas de la demo.
//
// Uso:   SECRETO="$(stellar keys show ana)" node scripts/usdc_blend.mjs
// La llave llega por la variable SECRETO y nunca se imprime. Una sola vez por cuenta: si ya recibió, lo dice y
// termina sin error. Revisa la transacción igual que la web (web/api/faucet-blend.ts) antes de firmarla.
import { createRequire } from 'node:module'

// El SDK de Stellar ya está instalado en web/ (npm ci): lo tomamos de ahí.
const requerir = createRequire(new URL('../web/package.json', import.meta.url))
const { Keypair, Networks, Transaction, TransactionBuilder, Horizon, Asset } = requerir('@stellar/stellar-sdk')

const FAUCET = process.env.FAUCET_BLEND_URL ?? 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets'
const EMISOR_BLEND = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56'

if (!process.env.SECRETO) {
  console.error('Falta SECRETO (la llave S... de la cuenta). Ejemplo: SECRETO="$(stellar keys show ana)" node scripts/usdc_blend.mjs')
  process.exit(1)
}
const kp = Keypair.fromSecret(process.env.SECRETO)
const yo = kp.publicKey()

const r = await fetch(`${FAUCET}?userId=${yo}`)
if (!r.ok) throw new Error(`el faucet de Blend respondió ${r.status}`)
const crudo = (await r.text()).trim()
const tx = TransactionBuilder.fromXDR(crudo.startsWith('"') ? JSON.parse(crudo) : crudo, Networks.TESTNET)
if (!(tx instanceof Transaction) || tx.source !== EMISOR_BLEND) throw new Error('la transacción no viene del faucet de Blend')
if (tx.operations.length === 0) {
  console.log(`   ${yo.slice(0, 4)}…${yo.slice(-4)} ya había recibido sus USDC de prueba de Blend`)
  process.exit(0)
}
for (const op of tx.operations) {
  const origen = op.source ?? tx.source
  const trust = op.type === 'changeTrust' && origen === yo && op.line instanceof Asset && op.line.getIssuer() === EMISOR_BLEND
  const pago = op.type === 'payment' && origen === EMISOR_BLEND && op.destination === yo && op.asset.getIssuer?.() === EMISOR_BLEND
  if (!trust && !pago) throw new Error(`operación inesperada en la transacción del faucet: ${op.type}`)
}
tx.sign(kp)
const res = await new Horizon.Server('https://horizon-testnet.stellar.org').submitTransaction(tx)
console.log(`   ${yo.slice(0, 4)}…${yo.slice(-4)} recibió 1 000 USDC de prueba de Blend (tx ${res.hash})`)
