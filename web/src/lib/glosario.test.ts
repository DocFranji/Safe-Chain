import { describe, expect, it } from 'vitest'
import { GLOSARIO, JERGA, dinero, dineroFino } from './glosario'

const U = 10_000_000n

describe('dinero', () => {
  it('montos enteros sin decimales', () => {
    expect(dinero(20n * U)).toBe('$20')
    expect(dinero(0n)).toBe('$0')
  })

  it('centavos con coma, como el resto de la web', () => {
    expect(dinero(112_712_316n)).toBe('$11,27')
    expect(dinero(5_000_000n)).toBe('$0,50')
  })

  it('miles con el separador de Costa Rica', () => {
    expect(dinero(1000n * U).replace(/\s/g, ' ')).toBe('$1 000')
  })

  it('negativos con el signo antes del $', () => {
    expect(dinero(-5n * U)).toBe('−$5')
  })
})

describe('dineroFino', () => {
  it('no esconde los centavos de centavo', () => {
    expect(dineroFino(39n)).toBe('$0,0000039')
    expect(dineroFino(-39n)).toBe('−$0,0000039')
  })

  it('los montos normales salen como dinero', () => {
    expect(dineroFino(1_234_567n)).toBe('$0,12')
    expect(dineroFino(0n)).toBe('$0')
  })
})

describe('glosario', () => {
  it('cada palabra vieja tiene un solo reemplazo', () => {
    const viejas = GLOSARIO.flatMap((t) => t.antes)
    expect(new Set(viejas).size).toBe(viejas.length)
  })

  it('ninguna palabra nueva es jerga', () => {
    for (const t of GLOSARIO) {
      for (const j of JERGA) expect(t.ahora.toLowerCase()).not.toContain(j.toLowerCase())
    }
  })
})
