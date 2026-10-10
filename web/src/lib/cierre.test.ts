import { describe, expect, it } from 'vitest'
import type { ContractEvent } from 'tanda'
import type { EventoTanda } from './historia'
import { cierreDe } from './cierre'

const U = 10_000_000n
let n = 0
const ev = (evento: ContractEvent): EventoTanda => ({ id: String(++n).padStart(6, '0'), ledger: n, cerradoEn: '2026-10-10T00:00:00Z', evento })

describe('cierreDe', () => {
  it('cuotas, pozo, depósito y lo que volvió (con su ganancia)', () => {
    const c = cierreDe(
      [
        ev({ name: 'EvRonda', data: { id: 1, ronda: 2, beneficiario: 'GCARLA', monto_pagado: 300n * U } }),
        ev({ name: 'EvRonda', data: { id: 1, ronda: 0, beneficiario: 'GANA', monto_pagado: 300n * U } }),
        ev({ name: 'EvLiquidado', data: { id: 1, miembro: 'GCARLA', monto: 114n * U } }),
      ],
      'GCARLA',
      { colateral_inicial: 100n * U },
      100n * U,
      3,
    )
    expect(c).toEqual({ cuotas: 300n * U, pozo: 300n * U, deposito: 100n * U, devuelto: 114n * U, ganancia: 14n * U })
  })

  it('sin eventos no inventa montos', () => {
    const c = cierreDe([], 'GCARLA', { colateral_inicial: 100n * U }, 100n * U, 3)
    expect(c.pozo).toBeNull()
    expect(c.devuelto).toBeNull()
    expect(c.ganancia).toBeNull()
  })

  it('si el depósito cubrió cuotas, la ganancia es negativa', () => {
    const c = cierreDe([ev({ name: 'EvLiquidado', data: { id: 1, miembro: 'GANA', monto: 0n } })], 'GANA', { colateral_inicial: 200n * U }, 100n * U, 3)
    expect(c.ganancia).toBe(-200n * U)
  })
})
