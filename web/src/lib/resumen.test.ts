import { describe, expect, it } from 'vitest'
import { FRECUENCIAS, cadaCuanto, fraseTanda, frecuenciaDe, lineaTanda, mensajeInvitacion, porPeriodo } from './resumen'

const U = 10_000_000n
const DIA = 86_400

describe('frecuencias', () => {
  it('semanal, quincenal y mensual (1 mes = 30 días)', () => {
    expect(FRECUENCIAS.map((f) => f.segundos)).toEqual([7 * DIA, 15 * DIA, 30 * DIA])
    expect(frecuenciaDe(15 * DIA)).toBe('quincenal')
    expect(frecuenciaDe(60)).toBeNull()
  })

  it('cada cuánto, en palabras', () => {
    expect(cadaCuanto(7 * DIA)).toBe('cada semana')
    expect(cadaCuanto(15 * DIA)).toBe('cada 15 días')
    expect(cadaCuanto(30 * DIA)).toBe('cada mes')
    expect(cadaCuanto(120)).toBe('cada 2 min')
    expect(porPeriodo(7 * DIA)).toBe('por semana')
    expect(porPeriodo(30 * DIA)).toBe('por mes')
    expect(porPeriodo(15 * DIA)).toBe('cada 15 días')
  })
})

describe('resumen', () => {
  const t = { cuota: 20n * U, n: 5, periodoSeg: 7 * DIA }

  it('la frase de la tanda', () => {
    expect(fraseTanda(t)).toBe('Cada semana, 5 personas ponen $20 y una de ellas recibe $100.')
    expect(lineaTanda(t)).toBe('5 personas · $20 por semana')
  })

  it('el mensaje de WhatsApp lleva el enlace y dice que es dinero de práctica', () => {
    const m = mensajeInvitacion({ ...t, link: 'https://rounda.test/#/tanda/7', quien: 'Ana' })
    expect(m).toContain('¡Hola! Soy Ana.')
    expect(m).toContain('5 personas ponemos $20 por semana y en cada turno una recibe $100')
    expect(m).toContain('https://rounda.test/#/tanda/7')
    expect(m).toContain('dólares de práctica')
    expect(mensajeInvitacion({ ...t, link: 'x' })).toMatch(/^¡Hola! Te invito/)
  })
})

describe('mensajeInvitacion: para un amigo', () => {
  const base = { cuota: 20n * 10_000_000n, n: 5, periodoSeg: 7 * 86_400, link: 'https://x/#/tanda/3' }
  it('lo saluda por su nombre', () => {
    expect(mensajeInvitacion({ ...base, quien: 'Ana', para: 'Beto' }).split('\n')[0]).toMatch(/^¡Hola, Beto! Soy Ana\. Te invito a mi tanda/)
    expect(mensajeInvitacion({ ...base, para: 'Beto' }).split('\n')[0]).toMatch(/^¡Hola, Beto! Te invito/)
  })
  it('sin nombre queda como siempre', () => {
    expect(mensajeInvitacion({ ...base, quien: 'Ana' }).split('\n')[0]).toMatch(/^¡Hola! Soy Ana\./)
  })
})
