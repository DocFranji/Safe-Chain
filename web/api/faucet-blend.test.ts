import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { EMISOR_BLEND, revisarTransaccion } from './faucet-blend.ts'

const persona = Keypair.random().publicKey()
const otra = Keypair.random().publicKey()
const usdc = new Asset('USDC', EMISOR_BLEND)

function tx(ops: ReturnType<typeof Operation.payment>[], fuente = EMISOR_BLEND, red = Networks.TESTNET) {
  const b = new TransactionBuilder(new Account(fuente, '1'), { fee: '100', networkPassphrase: red })
  for (const op of ops) b.addOperation(op)
  return b.setTimeout(30).build()
}

// Lo mismo que devuelve hoy el faucet de Blend (8 operaciones; aquí 2 activos).
const valida = () => [
  Operation.changeTrust({ asset: usdc, source: persona }),
  Operation.payment({ destination: persona, asset: usdc, amount: '1000', source: EMISOR_BLEND }),
  Operation.changeTrust({ asset: new Asset('BLND', EMISOR_BLEND), source: persona }),
  Operation.payment({ destination: persona, asset: new Asset('BLND', EMISOR_BLEND), amount: '5000', source: EMISOR_BLEND }),
]

describe('revisarTransaccion (faucet de Blend)', () => {
  it('acepta trustlines propias y pagos del emisor de Blend', () => {
    expect(revisarTransaccion(tx(valida()), persona)).toEqual({
      ok: true,
      recibe: [
        { codigo: 'USDC', monto: '1000.0000000' },
        { codigo: 'BLND', monto: '5000.0000000' },
      ],
    })
  })

  it('sin operaciones: la cuenta ya recibió', () => {
    expect(revisarTransaccion(tx([]), persona)).toEqual({ ok: false, error: 'YA_RECIBIO' })
  })

  it('rechaza que la persona pague a alguien', () => {
    const ops = [...valida(), Operation.payment({ destination: otra, asset: Asset.native(), amount: '100', source: persona })]
    expect(revisarTransaccion(tx(ops), persona).ok).toBe(false)
  })

  it('rechaza cualquier otra operación a nombre de la persona', () => {
    const ops = [...valida(), Operation.setOptions({ source: persona, masterWeight: 0 })]
    expect(revisarTransaccion(tx(ops as never), persona).ok).toBe(false)
  })

  it('rechaza trustlines de otros emisores y pagos a otras cuentas', () => {
    const falso = new Asset('USDC', Keypair.random().publicKey())
    expect(revisarTransaccion(tx([Operation.changeTrust({ asset: falso, source: persona })]), persona).ok).toBe(false)
    expect(
      revisarTransaccion(tx([Operation.payment({ destination: otra, asset: usdc, amount: '1', source: EMISOR_BLEND })]), persona).ok,
    ).toBe(false)
  })

  it('rechaza si la paga la persona o si no es de testnet', () => {
    expect(revisarTransaccion(tx(valida(), persona), persona).ok).toBe(false)
    expect(revisarTransaccion(tx(valida(), EMISOR_BLEND, Networks.PUBLIC), persona).ok).toBe(false)
  })
})
