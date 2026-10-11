import { describe, expect, it } from 'vitest'
import { clienteLectura } from './contrato'
import { FN_CREAR_AVANZADA_CON_NOMBRE, FN_CREAR_CON_NOMBRE, FN_LEER_NOMBRE, funcionesDe, soportaNombres } from './contratoNombres'

describe('soportaNombres', () => {
  it('hacen falta las tres funciones del contrato con nombres', () => {
    expect(soportaNombres([FN_LEER_NOMBRE, FN_CREAR_CON_NOMBRE, FN_CREAR_AVANZADA_CON_NOMBRE, 'crear_tanda'])).toBe(true)
    expect(soportaNombres([FN_LEER_NOMBRE, FN_CREAR_CON_NOMBRE])).toBe(false)
    expect(soportaNombres([FN_CREAR_CON_NOMBRE, FN_CREAR_AVANZADA_CON_NOMBRE])).toBe(false)
    expect(soportaNombres([])).toBe(false)
  })
  it('el cliente que trae la web ya conoce los nombres; un contrato v4 desplegado no', () => {
    const f = funcionesDe(clienteLectura().spec)
    expect(f).toContain('crear_tanda')
    expect(soportaNombres(f)).toBe(true)
    const v4 = f.filter((n) => ![FN_LEER_NOMBRE, FN_CREAR_CON_NOMBRE, FN_CREAR_AVANZADA_CON_NOMBRE, 'get_nombres'].includes(n))
    expect(v4).toContain('crear_tanda_avanzada')
    expect(soportaNombres(v4)).toBe(false)
  })
})
