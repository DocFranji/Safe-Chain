import { describe, expect, it } from 'vitest'
import { NOMBRE_MAX, caracterValido, errorNombre, idDeCreacion, limpiarNombre, normalizarNombre, problemaDeNombre } from './nombreTanda'

describe('limpiarNombre', () => {
  it('quita espacios al inicio, al final y dobles', () => {
    expect(limpiarNombre('  Tanda   de la oficina ')).toBe('Tanda de la oficina')
    expect(limpiarNombre('Tanda\nde\tamigos')).toBe('Tanda de amigos')
  })
  it('lo manda en NFC: la e con acento suelto se junta', () => {
    const suelto = 'Café'
    expect(suelto.length).toBe(5)
    expect(limpiarNombre(suelto)).toBe('Café')
    expect(limpiarNombre(suelto).length).toBe(4)
  })
})

describe('caracterValido', () => {
  it('acepta letras, tildes, ñ, ü, números, espacio y los signos permitidos', () => {
    for (const c of 'aZñÑáéíóúüÁÀÿÇ09 .,-_!?¿¡') expect(caracterValido(c), c).toBe(true)
  })
  it('rechaza × ÷, emojis, #, @, otros alfabetos y saltos de línea', () => {
    for (const c of ['×', '÷', '😀', '#', '@', 'Ж', '日', '\n', '\t', '"', '/', '€']) expect(caracterValido(c), c).toBe(false)
  })
})

describe('problemaDeNombre', () => {
  it('vacío no es problema: el nombre es opcional', () => {
    expect(problemaDeNombre('')).toBeNull()
  })
  it('de 2 a 40 caracteres', () => {
    expect(problemaDeNombre('A')).toMatch(/al menos 2/)
    expect(problemaDeNombre('Ab')).toBeNull()
    expect(problemaDeNombre('a'.repeat(NOMBRE_MAX))).toBeNull()
    expect(problemaDeNombre('a'.repeat(NOMBRE_MAX + 1))).toMatch(/máximo 40.*41/)
  })
  it('cuenta caracteres, no bytes', () => {
    expect(problemaDeNombre('ñ'.repeat(NOMBRE_MAX))).toBeNull()
  })
  it('dice cuál carácter no se puede', () => {
    expect(problemaDeNombre('Tanda #1')).toMatch(/«#»/)
    expect(problemaDeNombre('Fiesta 🎉')).toMatch(/«🎉»/)
  })
  it('el ejemplo del plan sirve', () => {
    expect(problemaDeNombre('Tanda de la oficina')).toBeNull()
    expect(problemaDeNombre('¡Vamos por la casa, equipo!')).toBeNull()
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
