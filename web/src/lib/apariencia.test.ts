import { describe, expect, it } from 'vitest'
import { elegirModo, esModo, LETRAS } from './apariencia'

describe('elegirModo', () => {
  it('sin nada en la URL sigue al sistema', () => {
    expect(elegirModo('', true)).toBe('oscuro')
    expect(elegirModo('', false)).toBe('claro')
  })
  it('la URL manda sobre el sistema', () => {
    expect(elegirModo('?modo=claro', true)).toBe('claro')
    expect(elegirModo('?modo=oscuro', false)).toBe('oscuro')
  })
  it('ignora valores que no son un modo (y los ?tema= de las pruebas de diseño anteriores)', () => {
    expect(elegirModo('?modo=noche', false)).toBe('claro')
    expect(elegirModo('?tema=sarchi', true)).toBe('oscuro')
    expect(esModo('azul')).toBe(false)
  })
})

describe('letras', () => {
  it('la marca usa Geist en los dos pesos que se ven', () => {
    expect(LETRAS.join()).toContain('Geist Variable')
    expect(LETRAS).toHaveLength(2)
  })
})
