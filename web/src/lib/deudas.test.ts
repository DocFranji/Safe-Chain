// Mismos casos que contracts/tanda/src/test_deudas.rs.
import { describe, expect, it } from 'vitest'
import { bolsaQueRecupera, errorMontoDeuda, saldoSuDeuda } from './deudas'

const U = 10_000_000n
const BETO = 'GBETO'
const CARLA = 'GCARLA'

describe('bolsaQueRecupera', () => {
  it('Carla debe a Beto y a su propia bolsa retenida: recupera 300 menos su multa de 10', () => {
    const d = {
      faltantes: [
        { ronda: 1, acreedor: BETO, monto: 100n * U },
        { ronda: 2, acreedor: CARLA, monto: 100n * U },
      ],
      bolsa_retenida: 200n * U,
      pagado: 0n,
    }
    expect(bolsaQueRecupera(d, CARLA, 10n * U)).toEqual({ bolsa: 300n * U, multas: 10n * U, neto: 290n * U })
  })

  it('sin bolsa retenida no recupera nada (su turno aún no llega o ya cobró)', () => {
    const d = { faltantes: [{ ronda: 2, acreedor: CARLA, monto: 100n * U }], bolsa_retenida: 0n, pagado: 0n }
    expect(bolsaQueRecupera(d, 'GANA', 10n * U)).toBeNull()
    expect(bolsaQueRecupera(undefined, 'GANA', 0n)).toBeNull()
  })
})

describe('saldoSuDeuda y errorMontoDeuda', () => {
  it('saldó: sin faltantes, pagó algo y ya no es moroso', () => {
    expect(saldoSuDeuda({ faltantes: [], bolsa_retenida: 0n, pagado: 100n * U }, false)).toBe(true)
    expect(saldoSuDeuda({ faltantes: [], bolsa_retenida: 0n, pagado: 100n * U }, true)).toBe(false)
    expect(saldoSuDeuda(undefined, false)).toBe(false)
  })

  it('no se puede pagar cero ni más de lo que se debe', () => {
    expect(errorMontoDeuda(null, 100n * U)).toMatch(/mayor que cero/)
    expect(errorMontoDeuda(0n, 100n * U)).toMatch(/mayor que cero/)
    expect(errorMontoDeuda(101n * U, 100n * U)).toMatch(/más de lo que debes/)
    expect(errorMontoDeuda(100n * U, 100n * U)).toBeNull()
  })
})
