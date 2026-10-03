import { describe, expect, it } from 'vitest'
import type { Tanda } from 'tanda'
import { elegirTanda, fraccionGarantia, reloj } from './demo'

const t = (id: number, tag: Tanda['estado']['tag']) => ({ id, tanda: { estado: { tag, values: undefined } } as Tanda })

describe('elegirTanda', () => {
  it('prefiere la más reciente en curso, aunque haya otras más nuevas abiertas', () => {
    const lista = [t(5, 'Abierta'), t(4, 'Abierta'), t(3, 'Activa'), t(2, 'Activa'), t(1, 'Finalizada')]
    expect(elegirTanda(lista)).toBe(3)
  })

  it('"por repartir" cuenta como en curso', () => {
    expect(elegirTanda([t(2, 'Abierta'), t(1, 'PorLiquidar')])).toBe(1)
  })

  it('sin tandas en curso, la abierta más reciente', () => {
    expect(elegirTanda([t(4, 'Cancelada'), t(3, 'Abierta'), t(2, 'Abierta'), t(1, 'Finalizada')])).toBe(3)
  })

  it('si todas terminaron, la última (para mostrar los resultados)', () => {
    expect(elegirTanda([t(2, 'Finalizada'), t(1, 'Finalizada')])).toBe(2)
  })

  it('sin tandas, nada', () => {
    expect(elegirTanda([])).toBeNull()
  })
})

describe('reloj', () => {
  it('formatea mm:ss y nunca es negativo', () => {
    expect(reloj(83)).toBe('1:23')
    expect(reloj(5)).toBe('0:05')
    expect(reloj(60)).toBe('1:00')
    expect(reloj(-4)).toBe('0:00')
  })
})

describe('fraccionGarantia', () => {
  it('cuánto le queda de la garantía inicial', () => {
    expect(fraccionGarantia(100n, 200n)).toBe(0.5)
    expect(fraccionGarantia(200n, 200n)).toBe(1)
    expect(fraccionGarantia(0n, 200n)).toBe(0)
    expect(fraccionGarantia(5n, 0n)).toBe(0)
  })
})
