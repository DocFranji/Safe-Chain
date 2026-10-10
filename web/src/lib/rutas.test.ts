import { describe, expect, it } from 'vitest'
import { linkInvitacion, parsearRuta, rutaDemo, rutaHistorial, rutaTanda } from './rutas'

describe('parsearRuta', () => {
  it('reconoce las páginas de la app', () => {
    expect(parsearRuta('')).toEqual({ tipo: 'inicio' })
    expect(parsearRuta('#/')).toEqual({ tipo: 'inicio' })
    expect(parsearRuta('#')).toEqual({ tipo: 'inicio' })
    expect(parsearRuta('#/tandas')).toEqual({ tipo: 'lobby' })
    expect(parsearRuta('#/tandas/')).toEqual({ tipo: 'lobby' })
    expect(parsearRuta('#/crear')).toEqual({ tipo: 'crear' })
    expect(parsearRuta('#/crear/')).toEqual({ tipo: 'crear' })
    expect(parsearRuta('#/tanda/3')).toEqual({ tipo: 'tanda', id: 3 })
    expect(parsearRuta('#/estado')).toEqual({ tipo: 'estado' })
  })

  it('los filtros de la lista (#/tandas?…) no cambian la página', () => {
    expect(parsearRuta('#/tandas?cuota=10-50&estado=abiertas')).toEqual({ tipo: 'lobby' })
    expect(parsearRuta('#/tandas/?q=ana')).toEqual({ tipo: 'lobby' })
    expect(parsearRuta('#/tanda/3?x=1')).toEqual({ tipo: 'tanda', id: 3 })
  })
  it('un ancla suelta (#como) no es una página: la landing no debe usar anclas con #', () => {
    expect(parsearRuta('#como')).toEqual({ tipo: 'desconocida' })
  })

  it('la demo en vivo elige sola la tanda, o se fija con un número', () => {
    expect(parsearRuta('#/demo')).toEqual({ tipo: 'demo', id: null })
    expect(parsearRuta('#/demo/')).toEqual({ tipo: 'demo', id: null })
    expect(parsearRuta('#/demo/7')).toEqual({ tipo: 'demo', id: 7 })
    expect(parsearRuta(rutaDemo(7))).toEqual({ tipo: 'demo', id: 7 })
    expect(parsearRuta('#/demo/0')).toEqual({ tipo: 'desconocida' })
    expect(parsearRuta('#/demo/x')).toEqual({ tipo: 'desconocida' })
  })

  it('rechaza ids que no son un número de tanda válido', () => {
    for (const malo of ['#/tanda/0', '#/tanda/-1', '#/tanda/abc', '#/tanda/1.5', '#/tanda/', '#/tanda/99999999999', '#/otra-cosa']) {
      expect(parsearRuta(malo)).toEqual({ tipo: 'desconocida' })
    }
  })
})

describe('link de invitación', () => {
  it('es la dirección del sitio más #/tanda/N, y se vuelve a leer igual', () => {
    const link = linkInvitacion(7, 'https://tanda.example', '/app/')
    expect(link).toBe('https://tanda.example/app/#/tanda/7')
    expect(parsearRuta(new URL(link).hash)).toEqual({ tipo: 'tanda', id: 7 })
    expect(rutaTanda(7)).toBe('#/tanda/7')
  })
})

describe('ruta del historial (M2)', () => {
  const G = 'GB2NSL6RGGWODEWQLUP4MD3LC7PMJ775RLGI7TCPT3NJBE2FOUED5BNK'
  it('reconoce el historial de una dirección y el propio', () => {
    expect(parsearRuta(`#/historial/${G}`)).toEqual({ tipo: 'historial', dir: G })
    expect(parsearRuta(rutaHistorial(G))).toEqual({ tipo: 'historial', dir: G })
    expect(parsearRuta('#/historial')).toEqual({ tipo: 'historial', dir: null })
  })
  it('rechaza direcciones mal formadas', () => {
    expect(parsearRuta('#/historial/GABC')).toEqual({ tipo: 'desconocida' })
    expect(parsearRuta(`#/historial/${G.toLowerCase()}`)).toEqual({ tipo: 'desconocida' })
  })
})

describe('ruta del perfil (M2, N4)', () => {
  it('reconoce #/perfil', () => {
    expect(parsearRuta('#/perfil')).toEqual({ tipo: 'perfil' })
    expect(parsearRuta('#/perfil/')).toEqual({ tipo: 'perfil' })
  })
})
