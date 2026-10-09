import { describe, expect, it } from 'vitest'
import { elegirModo, esModo, LETRAS } from './apariencia'

describe('elegirModo', () => {
  it('sin URL ni elección sigue al sistema', () => {
    expect(elegirModo('', null, true)).toBe('oscuro')
    expect(elegirModo('', null, false)).toBe('claro')
  })
  it('lo que la persona eligió con el botón manda sobre el sistema', () => {
    expect(elegirModo('', 'claro', true)).toBe('claro')
    expect(elegirModo('', 'oscuro', false)).toBe('oscuro')
  })
  it('la URL manda sobre todo', () => {
    expect(elegirModo('?modo=claro', 'oscuro', true)).toBe('claro')
    expect(elegirModo('?modo=oscuro', 'claro', false)).toBe('oscuro')
  })
  it('ignora valores que no son un modo (y los ?tema= de las pruebas de diseño anteriores)', () => {
    expect(elegirModo('?modo=noche', 'azul', false)).toBe('claro')
    expect(elegirModo('?tema=sarchi', null, true)).toBe('oscuro')
    expect(esModo('azul')).toBe(false)
  })
})

describe('letras', () => {
  it('la marca usa Geist en los dos pesos que se ven', () => {
    expect(LETRAS.join()).toContain('Geist Variable')
    expect(LETRAS).toHaveLength(2)
  })
})
