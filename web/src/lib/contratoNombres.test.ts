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
  it('con el contrato v4 (el cliente que trae la web) no hay nombres', () => {
    const f = funcionesDe(clienteLectura().spec)
    expect(f).toContain('crear_tanda')
    expect(f).toContain('crear_tanda_avanzada')
    expect(soportaNombres(f)).toBe(false)
  })
})
