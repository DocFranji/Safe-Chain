import { describe, expect, it } from 'vitest'
import { NOMBRE_MAX, errorNombre, normalizarNombre } from './nombreTanda'

describe('errorNombre (como el contrato)', () => {
  it('acepta el vacío (sin nombre) y nombres normales con tildes, números y signos', () => {
    for (const ok of [
      '',
      'ab',
      'Ahorro 2026',
      'Niños y niñas',
      '¡Vamos por la Peña!',
      '¿Quién cobra primero?',
      'Mamá, papá y yo',
      'Año-nuevo_vida.nueva',
      'ÁÉÍÓÚÜÑ áéíóúüñ',
      'Crème brûlée à ç',
    ]) {
      expect(errorNombre(ok), ok).toBeNull()
    }
  })

  it('acepta justo 40 caracteres, también los de dos bytes, y rechaza 41', () => {
    expect(errorNombre('1'.repeat(NOMBRE_MAX))).toBeNull()
    expect(errorNombre('ñ'.repeat(NOMBRE_MAX))).toBeNull()
    expect(errorNombre('1'.repeat(NOMBRE_MAX + 1))).toMatch(/hasta 40/)
    expect(errorNombre('ñ'.repeat(NOMBRE_MAX + 1))).toMatch(/hasta 40/)
  })

  it('rechaza uno solo, y los espacios al principio o al final', () => {
    expect(errorNombre('a')).toMatch(/al menos 2/)
    expect(errorNombre(' ')).toMatch(/espacio/)
    expect(errorNombre(' Ana')).toMatch(/espacio/)
    expect(errorNombre('Ana ')).toMatch(/espacio/)
  })

  it('rechaza símbolos, emojis, saltos de línea, otros alfabetos y × ÷', () => {
    for (const mal of ['Tanda #1', 'a@b', 'Tanda <b>', 'Tanda\nnueva', 'Tanda\ttab', 'Tanda 5×', 'Mitad ÷ dos', 'Tanda 🎉', 'Здравствуйте', '日本語の名前', 'Tanda​oculta', 'Tanda nbsp', 'ª º']) {
      expect(errorNombre(mal), mal).not.toBeNull()
    }
  })

  it('un acento suelto se normaliza a una sola letra y entonces es válido', () => {
    const suelto = 'Café bar'
    expect(normalizarNombre(suelto)).toBe('Café bar')
    expect(errorNombre(suelto)).toBeNull()
  })
})
