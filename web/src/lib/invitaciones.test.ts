import { describe, expect, it } from 'vitest'
import { CLAVE_INVITACIONES, guardarInvitacion, invitacionDeEntrada, leerInvitaciones, MAX_INVITACIONES } from './invitaciones'

function almacen(inicial?: string) {
  let guardado = inicial ?? null
  return {
    getItem: () => guardado,
    setItem: (_k: string, v: string) => {
      guardado = v
    },
    crudo: () => guardado,
  }
}

describe('invitacionDeEntrada', () => {
  it('lo primero que se abre es la página de una tanda: esa es la invitación', () => {
    expect(invitacionDeEntrada('#/tanda/5')).toBe(5)
    expect(invitacionDeEntrada('#/tanda/12/')).toBe(12)
  })

  it('cualquier otra página no lo es', () => {
    for (const hash of ['', '#/', '#/tandas', '#/crear', '#/perfil', '#/demo/3', '#/tanda/0', '#/tanda/abc']) {
      expect(invitacionDeEntrada(hash)).toBeNull()
    }
  })
})

describe('guardarInvitacion y leerInvitaciones', () => {
  it('anota la tanda y desde cuándo; abrir el enlace otra vez no cambia el momento', () => {
    const a = almacen()
    guardarInvitacion(a, 5, 1000)
    guardarInvitacion(a, 7, 2000)
    guardarInvitacion(a, 5, 3000)
    expect(leerInvitaciones(a)).toEqual([
      { id: 5, desde: 1000 },
      { id: 7, desde: 2000 },
    ])
  })

  it('recuerda solo las más recientes', () => {
    const a = almacen()
    for (let id = 1; id <= MAX_INVITACIONES + 5; id++) guardarInvitacion(a, id, id)
    const lista = leerInvitaciones(a)
    expect(lista).toHaveLength(MAX_INVITACIONES)
    expect(lista[0].id).toBe(6)
    expect(lista.at(-1)?.id).toBe(MAX_INVITACIONES + 5)
  })

  it('lo guardado que no sirve se ignora', () => {
    expect(leerInvitaciones(almacen('{no es json'))).toEqual([])
    expect(leerInvitaciones(almacen('{"id":5}'))).toEqual([])
    expect(leerInvitaciones(almacen(JSON.stringify([{ id: 5, desde: 1 }, { id: 'x', desde: 1 }, { id: -2, desde: 1 }, null])))).toEqual([{ id: 5, desde: 1 }])
  })

  it('sin almacenamiento nada se rompe', () => {
    expect(leerInvitaciones(null)).toEqual([])
    expect(() => guardarInvitacion(null, 5, 1)).not.toThrow()
    const lleno = { getItem: () => null, setItem: () => { throw new Error('lleno') } }
    expect(() => guardarInvitacion(lleno, 5, 1)).not.toThrow()
  })

  it('la clave es la de siempre', () => {
    const a = almacen()
    guardarInvitacion(a, 5, 1)
    expect(CLAVE_INVITACIONES).toBe('rounda:invitaciones')
    expect(a.crudo()).toBe('[{"id":5,"desde":1}]')
  })
})
