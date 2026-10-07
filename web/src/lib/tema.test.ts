import { describe, expect, it } from 'vitest'
import { elegirTema, esTema, TEMA_POR_DEFECTO } from './tema'

describe('elegirTema', () => {
  it('la URL manda sobre lo guardado y la configuración', () => {
    expect(elegirTema('?tema=fintech', 'carreta', 'carreta')).toBe('fintech')
  })
  it('sin URL usa lo último elegido', () => {
    expect(elegirTema('', 'fintech', 'carreta')).toBe('fintech')
  })
  it('sin URL ni guardado usa VITE_TEMA', () => {
    expect(elegirTema('', null, 'fintech')).toBe('fintech')
  })
  it('ignora valores que no son un tema y cae al de por defecto', () => {
    expect(elegirTema('?tema=oscuro', 'azul', 'x')).toBe(TEMA_POR_DEFECTO)
    expect(esTema('carreta')).toBe(true)
    expect(esTema('oscuro')).toBe(false)
  })
})
