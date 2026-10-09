import { describe, expect, it } from 'vitest'
import { deudaDe } from './misDeudas'

describe('deudaDe', () => {
  const miembros = [
    { direccion: 'GANA', deuda: 0n },
    { direccion: 'GBETO', deuda: 1_000_000_000n },
  ]
  it('da la deuda de quien está en la tanda', () => {
    expect(deudaDe(miembros, 'GBETO')).toBe(1_000_000_000n)
    expect(deudaDe(miembros, 'GANA')).toBe(0n)
  })
  it('0 si no está en la tanda', () => {
    expect(deudaDe(miembros, 'GCARLA')).toBe(0n)
  })
})
