import { describe, expect, it } from 'vitest'
import { aUnidades, usdcDeSaldos } from './usdc'

const EMISOR = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56'

describe('aUnidades', () => {
  it('convierte el texto de Horizon a 7 decimales sin perder centavos', () => {
    expect(aUnidades('1000.0000000')).toBe(10_000_000_000n)
    expect(aUnidades('999.0000051')).toBe(9_990_000_051n)
    expect(aUnidades('0.5')).toBe(5_000_000n)
    expect(aUnidades('12')).toBe(120_000_000n)
  })
})

describe('usdcDeSaldos', () => {
  it('encuentra el USDC de Blend y no se confunde con otro USDC', () => {
    const saldos = [
      { asset_type: 'native', balance: '9998.0000000' },
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GOTRO', balance: '5.0000000' },
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: EMISOR, balance: '1000.0000000' },
    ]
    expect(usdcDeSaldos(saldos, EMISOR)).toEqual({ trustline: true, saldo: 10_000_000_000n })
  })

  it('sin la línea de USDC de Blend: no lo acepta todavía', () => {
    expect(usdcDeSaldos([{ asset_type: 'native', balance: '10000.0000000' }], EMISOR)).toEqual({ trustline: false, saldo: 0n })
  })
})
