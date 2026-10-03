import { describe, expect, it, vi, afterEach } from 'vitest'
import { Account, Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

// Freighter no existe en las pruebas: si el código la llamara por error, la prueba lo detecta.
const freighter = vi.hoisted(() => vi.fn(async () => ({ signedTxXdr: 'FIRMADA_POR_FREIGHTER', signerAddress: 'G' })))
vi.mock('@stellar/freighter-api', () => ({ signTransaction: freighter }))

import { aHex, deHex, firmarTransaccion, firmarXdrConHash, usarFirmantePrivy, type FirmarHash } from './firmante'

const RED = Networks.TESTNET

function txDePrueba(origen: string): string {
  return new TransactionBuilder(new Account(origen, '1'), { fee: BASE_FEE, networkPassphrase: RED })
    .addOperation(Operation.changeTrust({ asset: new Asset('TUSD', Keypair.random().publicKey()) }))
    .setTimeout(60)
    .build()
    .toXDR()
}

/** Imita a Privy: firma el hash con una llave que "vive" fuera de la app y la devuelve en hex. */
function privyFalso(llave: Keypair): FirmarHash {
  return async (_dir, hash) => deHex(aHex(llave.sign(Buffer.from(hash))))
}

afterEach(() => {
  usarFirmantePrivy(null)
  freighter.mockClear()
})

describe('firmarXdrConHash', () => {
  it('produce una transacción con una firma válida de esa dirección', async () => {
    const llave = Keypair.random()
    const firmada = TransactionBuilder.fromXDR(
      await firmarXdrConHash(txDePrueba(llave.publicKey()), RED, llave.publicKey(), privyFalso(llave)),
      RED,
    )
    expect(firmada.signatures).toHaveLength(1)
    expect(llave.verify(firmada.hash(), firmada.signatures[0].signature)).toBe(true)
  })

  it('rechaza una firma de otra llave', async () => {
    const llave = Keypair.random()
    const otra = Keypair.random()
    await expect(firmarXdrConHash(txDePrueba(llave.publicKey()), RED, llave.publicKey(), privyFalso(otra))).rejects.toThrow()
  })
})

describe('firmarTransaccion', () => {
  it('sin sesión de Google, firma Freighter', async () => {
    const r = await firmarTransaccion('XDR', { address: 'GALGUNA' })
    expect(r.signedTxXdr).toBe('FIRMADA_POR_FREIGHTER')
    expect(freighter).toHaveBeenCalledOnce()
  })

  it('con sesión de Google, firma Privy y no Freighter', async () => {
    const llave = Keypair.random()
    usarFirmantePrivy({ direccion: llave.publicKey(), firmarHash: privyFalso(llave) })
    const r = await firmarTransaccion(txDePrueba(llave.publicKey()), { networkPassphrase: RED, address: llave.publicKey() })
    expect(r.error).toBeUndefined()
    expect(r.signerAddress).toBe(llave.publicKey())
    expect(TransactionBuilder.fromXDR(r.signedTxXdr, RED).signatures).toHaveLength(1)
    expect(freighter).not.toHaveBeenCalled()
  })

  it('si Privy falla, devuelve un error en lugar de romper', async () => {
    const llave = Keypair.random()
    usarFirmantePrivy({ direccion: llave.publicKey(), firmarHash: async () => { throw new Error('El usuario canceló') } })
    const r = await firmarTransaccion(txDePrueba(llave.publicKey()), { networkPassphrase: RED, address: llave.publicKey() })
    expect(r.error?.message).toBe('El usuario canceló')
  })
})

describe('hex', () => {
  it('ida y vuelta', () => {
    const b = new Uint8Array([0, 1, 171, 255])
    expect(aHex(b)).toBe('0x0001abff')
    expect(deHex(aHex(b))).toEqual(b)
  })
})
