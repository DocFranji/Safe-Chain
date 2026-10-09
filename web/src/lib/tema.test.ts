import { describe, expect, it } from 'vitest'
import { elegirModo, elegirTema, esModo, esTema, letrasDe, TEMA_POR_DEFECTO, TEMAS, tieneOscuro } from './tema'

describe('elegirTema', () => {
  it('la URL manda sobre lo guardado y la configuración', () => {
    expect(elegirTema('?tema=montana', 'sarchi', 'sarchi')).toBe('montana')
  })
  it('sin URL usa lo último elegido', () => {
    expect(elegirTema('', 'montana', 'sarchi')).toBe('montana')
  })
  it('sin URL ni guardado usa VITE_TEMA', () => {
    expect(elegirTema('', null, 'montana')).toBe('montana')
  })
  it('ignora valores que no son un tema (también los de rondas anteriores) y cae al de por defecto', () => {
    expect(elegirTema('?tema=oscuro', 'carreta', 'cusuco')).toBe(TEMA_POR_DEFECTO)
    expect(esTema('sarchi')).toBe(true)
    expect(esTema('fintech')).toBe(false)
  })
  it('hay tres opciones y cada una tiene nombre propio', () => {
    expect(TEMAS.map((t) => t.id)).toEqual(['orbita', 'sarchi', 'montana'])
    expect(new Set(TEMAS.map((t) => t.nombre)).size).toBe(3)
    expect(TEMA_POR_DEFECTO).toBe('orbita')
  })
})

describe('elegirModo', () => {
  it('sigue al teléfono si nadie eligió', () => {
    expect(elegirModo('sarchi', '', null, true)).toBe('oscuro')
    expect(elegirModo('montana', '', null, false)).toBe('claro')
  })
  it('la URL manda sobre lo guardado, y lo guardado sobre el teléfono', () => {
    expect(elegirModo('montana', '?modo=claro', 'oscuro', true)).toBe('claro')
    expect(elegirModo('montana', '', 'oscuro', false)).toBe('oscuro')
  })
  it('las dos opciones tienen modo oscuro', () => {
    expect(tieneOscuro('sarchi')).toBe(true)
    expect(tieneOscuro('montana')).toBe(true)
  })
  it('ignora valores que no son un modo', () => {
    expect(esModo('noche')).toBe(false)
    expect(elegirModo('sarchi', '?modo=noche', 'azul', false)).toBe('claro')
  })
})

describe('letrasDe', () => {
  it('cada opción pide sus letras antes de dibujar', () => {
    expect(letrasDe('sarchi')[0]).toContain('Archivo Variable')
    expect(letrasDe('montana').join()).toContain('Bricolage Grotesque Variable')
    expect(letrasDe('montana').join()).toContain('Geist Variable')
    expect(letrasDe('orbita').join()).toContain('Geist Variable')
  })
})
