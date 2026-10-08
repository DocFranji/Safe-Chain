import { describe, expect, it } from 'vitest'
import { elegirModo, elegirTema, esModo, esTema, TEMA_POR_DEFECTO, TEMAS, tieneOscuro } from './tema'

describe('elegirTema', () => {
  it('la URL manda sobre lo guardado y la configuración', () => {
    expect(elegirTema('?tema=fintech', 'carreta', 'carreta')).toBe('fintech')
    expect(elegirTema('?tema=cusuco', 'lima', 'ronda')).toBe('cusuco')
  })
  it('sin URL usa lo último elegido', () => {
    expect(elegirTema('', 'ronda', 'carreta')).toBe('ronda')
  })
  it('sin URL ni guardado usa VITE_TEMA', () => {
    expect(elegirTema('', null, 'lima')).toBe('lima')
  })
  it('ignora valores que no son un tema y cae al de por defecto', () => {
    expect(elegirTema('?tema=oscuro', 'azul', 'x')).toBe(TEMA_POR_DEFECTO)
    expect(esTema('carreta')).toBe(true)
    expect(esTema('oscuro')).toBe(false)
  })
  it('hay cinco mundos y cada uno tiene nombre propio', () => {
    expect(TEMAS.map((t) => t.id).sort()).toEqual(['carreta', 'cusuco', 'fintech', 'lima', 'ronda'])
    expect(new Set(TEMAS.map((t) => t.nombre)).size).toBe(TEMAS.length)
  })
})

describe('elegirModo', () => {
  it('los mundos nuevos siguen al teléfono si nadie eligió', () => {
    expect(elegirModo('lima', '', null, true)).toBe('oscuro')
    expect(elegirModo('cusuco', '', null, false)).toBe('claro')
  })
  it('la URL manda sobre lo guardado, y lo guardado sobre el teléfono', () => {
    expect(elegirModo('ronda', '?modo=claro', 'oscuro', true)).toBe('claro')
    expect(elegirModo('ronda', '', 'oscuro', false)).toBe('oscuro')
  })
  it('carreta y fintech siempre van claros', () => {
    expect(tieneOscuro('carreta')).toBe(false)
    expect(elegirModo('carreta', '?modo=oscuro', 'oscuro', true)).toBe('claro')
    expect(elegirModo('fintech', '', null, true)).toBe('claro')
  })
  it('ignora valores que no son un modo', () => {
    expect(esModo('noche')).toBe(false)
    expect(elegirModo('lima', '?modo=noche', 'azul', false)).toBe('claro')
  })
})
