import { describe, expect, it } from 'vitest'
import { idDeCreacion, limpiarNombre } from './nombreCrear'
import { errorNombre } from './nombreTanda'

describe('limpiarNombre', () => {
  it('quita espacios al inicio, al final y dobles', () => {
    expect(limpiarNombre('  Tanda   de la oficina ')).toBe('Tanda de la oficina')
    expect(limpiarNombre('Tanda\nde\tamigos')).toBe('Tanda de amigos')
  })
  it('lo manda en NFC: la e con acento suelto se junta', () => {
    const suelto = 'Café'
    expect(suelto.length).toBe(5)
    expect(limpiarNombre(suelto)).toBe('Café')
  })
  it('lo limpio ya pasa la regla de espacios del contrato', () => {
    expect(errorNombre(limpiarNombre('  Casa nueva '))).toBeNull()
    expect(limpiarNombre('   ')).toBe('')
  })
})

describe('idDeCreacion', () => {
  const ok = (v: number) => ({ isErr: () => false, unwrap: () => v })
  it('acepta el número solo o dentro de un Result', () => {
    expect(idDeCreacion(7)).toBe(7)
    expect(idDeCreacion(ok(8))).toBe(8)
  })
  it('un Result con error o un valor raro lanzan', () => {
    expect(() => idDeCreacion({ isErr: () => true, unwrap: () => 1 })).toThrow(/rechazó/)
    expect(() => idDeCreacion(undefined)).toThrow(/inesperado/)
    expect(() => idDeCreacion(0)).toThrow(/inesperado/)
    expect(() => idDeCreacion('5')).toThrow(/inesperado/)
  })
})
