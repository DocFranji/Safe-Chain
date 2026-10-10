import { describe, expect, it } from 'vitest'
import { avisosDePagoPendiente, textoConfirmarUnirse, unirNombres } from './morosos'

describe('unirNombres', () => {
  it('uno, dos y varios', () => {
    expect(unirNombres([])).toBe('')
    expect(unirNombres(['Beto'])).toBe('Beto')
    expect(unirNombres(['Beto', 'Carla'])).toBe('Beto y Carla')
    expect(unirNombres(['Beto', 'Carla', 'Ana'])).toBe('Beto, Carla y Ana')
  })

  it('antes de "i" o "hi" la "y" se escribe "e"', () => {
    expect(unirNombres(['Beto', 'Irene'])).toBe('Beto e Irene')
    expect(unirNombres(['Beto', 'Íñigo'])).toBe('Beto e Íñigo')
    expect(unirNombres(['Beto', 'Hilda'])).toBe('Beto e Hilda')
    expect(unirNombres(['Beto', 'Carla', 'Isabel'])).toBe('Beto, Carla e Isabel')
  })

  it('pero no antes de un diptongo ("ia", "ie", "io") ni de otras letras', () => {
    expect(unirNombres(['Beto', 'Iago'])).toBe('Beto y Iago')
    expect(unirNombres(['Beto', 'Hiena'])).toBe('Beto y Hiena')
    expect(unirNombres(['Beto', 'Ana'])).toBe('Beto y Ana')
    expect(unirNombres(['Beto', 'GADM…TVPD'])).toBe('Beto y GADM…TVPD')
  })
})

describe('avisosDePagoPendiente', () => {
  it('sin nadie con un pago pendiente no hay aviso', () => {
    expect(avisosDePagoPendiente([], false)).toEqual([])
  })

  it('una persona: las palabras del plan', () => {
    expect(avisosDePagoPendiente(['Beto'], false)).toEqual([
      {
        titulo: 'Beto tiene un pago pendiente en otra tanda',
        detalle: 'Si la tanda empieza y no paga, su depósito podría no alcanzar.',
      },
    ])
  })

  it('varias personas: todo en plural', () => {
    expect(avisosDePagoPendiente(['Beto', 'Carla'], false)).toEqual([
      {
        titulo: 'Beto y Carla tienen pagos pendientes en otras tandas',
        detalle: 'Si la tanda empieza y no pagan, sus depósitos podrían no alcanzar.',
      },
    ])
  })

  it('si quien mira también tiene un pago pendiente, se le habla a él aparte', () => {
    const avisos = avisosDePagoPendiente(['Beto'], true)
    expect(avisos).toHaveLength(2)
    expect(avisos[1].titulo).toBe('Tienes un pago pendiente en otra tanda')
    expect(avisos[1].detalle).toMatch(/tu depósito podría no alcanzar/)
    expect(avisosDePagoPendiente([], true)).toHaveLength(1)
  })

  it('no usa la jerga del glosario', () => {
    const texto = JSON.stringify([...avisosDePagoPendiente(['Beto', 'Carla'], true), textoConfirmarUnirse(['Beto'])])
    expect(texto).not.toMatch(/mora|moroso|garantía|colateral|bolsa|ronda/i)
  })
})

describe('textoConfirmarUnirse', () => {
  it('una persona', () => {
    const t = textoConfirmarUnirse(['Beto'])
    expect(t.titulo).toBe('Beto tiene un pago pendiente en otra tanda')
    expect(t.detalle).toMatch(/su depósito podría no alcanzar/)
    expect(t.detalle).toMatch(/pozo de algún turno podría llegar incompleto/)
  })

  it('varias personas', () => {
    const t = textoConfirmarUnirse(['Beto', 'Carla', 'Ana'])
    expect(t.titulo).toBe('Beto, Carla y Ana tienen pagos pendientes en otras tandas')
    expect(t.detalle).toMatch(/sus depósitos podrían no alcanzar/)
  })
})
