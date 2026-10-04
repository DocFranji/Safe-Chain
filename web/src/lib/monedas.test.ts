import { describe, expect, it } from 'vitest'
import { TOKEN_ID, USDC_ID } from '../config'
import { TUSD, USDC, monedaDe, montoFino } from './monedas'

describe('monedaDe', () => {
  it('TUSD (y una tanda sin token conocido todavía) usa rendimiento simulado', () => {
    expect(monedaDe(TOKEN_ID)).toBe(TUSD)
    expect(monedaDe(undefined)).toBe(TUSD)
    expect(TUSD.real).toBe(false)
  })

  it('USDC de Blend usa rendimiento real', () => {
    expect(USDC).not.toBeNull()
    expect(monedaDe(USDC_ID)).toMatchObject({ simbolo: 'USDC', real: true })
  })

  it('un token desconocido se muestra abreviado', () => {
    expect(monedaDe('CABCDEFGHIJK')).toMatchObject({ simbolo: 'CABC…', real: false })
  })
})

describe('montoFino', () => {
  it('muestra el rendimiento real de Blend aunque sea muy chico', () => {
    expect(montoFino(39n)).toBe('0,0000039')
    expect(montoFino(108n)).toBe('0,0000108')
    expect(montoFino(8_984n)).toBe('0,0008984')
    expect(montoFino(-50n)).toBe('−0,000005')
  })
  it('los montos normales se ven igual que siempre', () => {
    expect(montoFino(0n)).toBe('0')
    expect(montoFino(1_000_000_000n)).toBe('100')
    expect(montoFino(112_712_316n)).toBe('11,27')
  })
})
