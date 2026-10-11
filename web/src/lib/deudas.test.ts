// Mismos casos que contracts/tanda/src/test_deudas.rs.
import { describe, expect, it } from 'vitest'
import {
  bolsaQueRecupera,
  destinoTrasTerminar,
  errorMontoDeuda,
  faltantesAlCerrar,
  garantiaPendiente,
  saldoSuDeuda,
} from './deudas'

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
    expect(bolsaQueRecupera(d, CARLA, 10n * U)).toEqual({ bolsa: 300n * U, multas: 10n * U, garantia: 0n, neto: 290n * U })
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

describe('garantiaPendiente (igual que moroso_salda_a_mitad_de_tanda_y_repone_su_garantia)', () => {
  const t = { estado: 'Activa', n_miembros: 4, ronda_actual: 2, cuota: 100n * U, cobertura_bps: 0 }

  it('Beto salda en la ronda 3 de 4: debe 2 cuotas, garantía mínima de una cuota', () => {
    expect(garantiaPendiente(t, 0n)).toBe(100n * U)
    const d = { faltantes: [{ ronda: 1, acreedor: BETO, monto: 100n * U }], bolsa_retenida: 300n * U, pagado: 0n }
    expect(bolsaQueRecupera(d, BETO, 10n * U, garantiaPendiente(t, 0n))).toEqual({
      bolsa: 400n * U,
      multas: 10n * U,
      garantia: 100n * U,
      neto: 290n * U,
    })
  })

  it('con garantía del 100 % repone las cuotas que faltan; si la tanda terminó, nada', () => {
    expect(garantiaPendiente({ ...t, cobertura_bps: 10_000 }, 0n)).toBe(200n * U)
    expect(garantiaPendiente({ ...t, cobertura_bps: 10_000 }, 150n * U)).toBe(50n * U)
    expect(garantiaPendiente({ ...t, estado: 'PorLiquidar' }, 0n)).toBe(0n)
  })
})

describe('faltantesAlCerrar (como cerrar_ronda, v5)', () => {
  const cuota = 100n * U
  it('quien pagó, o tiene garantía para TODAS las cuotas que le quedan y no debe nada, no deja faltante', () => {
    const miembros = [
      { direccion: 'A', colateral: 0n },
      { direccion: BETO, colateral: 200n * U },
      { direccion: CARLA, colateral: 300n * U },
    ]
    // Quedan 2 cuotas (esta y una más): Beto y Carla las cubren; Ana pagó.
    expect(faltantesAlCerrar(miembros, ['A'], cuota, 2)).toEqual([])
  })

  it('si la garantía no alcanza para todo lo que le queda, la cuota entera queda como deuda (no se usa la garantía)', () => {
    const miembros = [
      { direccion: BETO, colateral: 150n * U },
      { direccion: CARLA, colateral: 0n },
    ]
    expect(faltantesAlCerrar(miembros, [], cuota, 2)).toEqual([
      { direccion: BETO, falta: 100n * U },
      { direccion: CARLA, falta: 100n * U },
    ])
  })

  it('quien ya debe algo no cubre con su garantía, aunque le sobre', () => {
    const miembros = [{ direccion: BETO, colateral: 500n * U, deuda: 100n * U }]
    expect(faltantesAlCerrar(miembros, [], cuota, 2)).toEqual([{ direccion: BETO, falta: 100n * U }])
  })

  it('en la última ronda basta con una cuota de garantía', () => {
    expect(faltantesAlCerrar([{ direccion: BETO, colateral: 100n * U }], [], cuota, 1)).toEqual([])
  })
})

describe('destinoTrasTerminar (M1 v4)', () => {
  const cobro = (d: string) => d !== 'MOROSA'
  it('directo a quien cobró de menos si recibió su bolsa', () => {
    expect(destinoTrasTerminar('CARLA', 'ANA', cobro)).toBe('directo')
  })
  it('al reparto si su bolsa se retuvo, o si es la propia', () => {
    expect(destinoTrasTerminar('MOROSA', 'ANA', cobro)).toBe('reparto')
    expect(destinoTrasTerminar('ANA', 'ANA', cobro)).toBe('reparto')
  })
})
