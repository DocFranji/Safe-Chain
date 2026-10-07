// Duraciones largas y fechas (misión M1: tandas de semanas y meses).
import { describe, expect, it } from 'vitest'
import { cuando, duracion, fechaLarga, hora } from './formato'

const DIA = 86_400
const CR = 'America/Costa_Rica'
/** Martes 3 de noviembre de 2026, 9:00 a. m. en Costa Rica (15:00 UTC). */
const MARTES = 1_793_718_000

describe('duracion', () => {
  it('mantiene minutos y horas como antes', () => {
    expect(duracion(83)).toBe('1 min 23 s')
    expect(duracion(60)).toBe('1 min')
    expect(duracion(3_600)).toBe('1 h')
    expect(duracion(90 * 60)).toBe('1 h 30 min')
  })

  it('días, semanas y meses (1 mes = 30 días)', () => {
    expect(duracion(2 * DIA)).toBe('2 días')
    expect(duracion(15 * DIA)).toBe('15 días')
    expect(duracion(7 * DIA)).toBe('1 semana')
    expect(duracion(14 * DIA)).toBe('2 semanas')
    expect(duracion(30 * DIA)).toBe('1 mes')
    expect(duracion(90 * DIA)).toBe('3 meses')
    expect(duracion(12 * 30 * DIA)).toBe('12 meses')
    expect(duracion(45 * DIA)).toBe('45 días')
  })

  it('una cuenta regresiva larga se ve en días', () => {
    expect(duracion(29 * DIA + 3 * 3_600)).toBe('29 días')
  })
})

describe('fechas', () => {
  it('fecha larga sin el año si es el mismo', () => {
    expect(fechaLarga(MARTES, MARTES, CR)).toBe('martes 3 de noviembre')
  })

  it('agrega el año si es otro', () => {
    expect(fechaLarga(MARTES + 365 * DIA, MARTES, CR)).toBe('miércoles 3 de noviembre de 2027')
  })

  it('hora en formato de Costa Rica', () => {
    expect(hora(MARTES, CR)).toMatch(/^9:00 a\. ?m\.$/)
  })

  it('"hoy", "mañana" o la fecha', () => {
    expect(cuando(MARTES, MARTES - 3_600, CR)).toMatch(/^hoy a las 9:00/)
    expect(cuando(MARTES, MARTES - DIA, CR)).toMatch(/^mañana a las 9:00/)
    expect(cuando(MARTES, MARTES - 10 * DIA, CR)).toBe('el martes 3 de noviembre')
  })
})
