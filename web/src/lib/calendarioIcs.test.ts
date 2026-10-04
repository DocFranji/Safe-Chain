import { describe, expect, it } from 'vitest'
import { escapar, eventosDePago, generarIcs, plegar, type DatosCalendario } from './calendarioIcs'

const U = 10_000_000n
const DIA = 86_400
const MES = 30 * DIA
// martes 3 de noviembre de 2026, 14:00 UTC
const VENCE = Date.UTC(2026, 10, 3, 14, 0, 0) / 1000

/** Tanda mensual de 4, en la ronda 3 (índice 2); yo cobro en la última. */
const datos = (o: Partial<DatosCalendario> = {}): DatosCalendario => ({
  id: 6,
  contrato: 'CTANDA',
  nMiembros: 4,
  rondaActual: 2,
  periodoSeg: MES,
  vence: VENCE,
  cuota: 100n * U,
  simbolo: 'TUSD',
  cobra: ['Ana', 'Beto', 'Carla', 'Tú'],
  miRonda: 3,
  enlace: 'https://rounda.test/#/tanda/6',
  ...o,
})

describe('eventosDePago', () => {
  it('una fecha por ronda que falta, ancladas al calendario de la tanda', () => {
    const e = eventosDePago(datos(), VENCE - DIA)
    expect(e.map((x) => [x.ronda, x.vence])).toEqual([
      [2, VENCE],
      [3, VENCE + MES],
    ])
    expect(e[0].titulo).toBe('Tanda 6: paga tu cuota de 100 TUSD (ronda 3 de 4)')
    expect(e[0].descripcion).toMatch(/Esta ronda cobra Carla\./)
    expect(e[0].descripcion).toMatch(/https:\/\/rounda\.test\/#\/tanda\/6/)
  })

  it('en la ronda en que cobro, el título lo dice y explica cómo cobrar', () => {
    const e = eventosDePago(datos(), VENCE - DIA)[1]
    expect(e.titulo).toBe('Tanda 6: pagas tu cuota y cobras tu bolsa (ronda 4 de 4)')
    expect(e.descripcion).toMatch(/Tu bolsa está lista: cóbrala/)
  })

  it('no incluye la ronda que ya venció; si no se sabe quién cobra, no lo inventa', () => {
    const e = eventosDePago(datos({ cobra: ['Ana', 'Beto', 'Carla', null], miRonda: null }), VENCE + 60)
    expect(e.map((x) => x.ronda)).toEqual([3])
    expect(e[0].descripcion).not.toMatch(/Esta ronda cobra/)
  })
})

describe('formato iCalendar', () => {
  it('escapa comas, punto y coma, barras y saltos de línea', () => {
    expect(escapar('a, b; c\\d\nX')).toBe('a\\, b\\; c\\\\d\\nX')
  })

  it('pliega las líneas largas en trozos de máximo 75 bytes sin cortar letras', () => {
    const larga = `DESCRIPTION:${'Mañana vence tu cuota de la tanda ñandú. '.repeat(6)}`
    const plegada = plegar(larga)
    for (const l of plegada.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(plegada.replace(/\r\n /g, '')).toBe(larga)
    expect(plegar('CORTA')).toBe('CORTA')
  })

  it('archivo completo: eventos con UID estable, la última hora antes de que venza y dos recordatorios', () => {
    const ics = generarIcs(datos(), VENCE - DIA)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:rounda-CTANDA-6-2@rounda')
    expect(ics).toContain('DTSTART:20261103T130000Z')
    expect(ics).toContain('DTEND:20261103T140000Z')
    expect(ics.match(/TRIGGER:-P1D/g)).toHaveLength(2)
    expect(ics.match(/TRIGGER:PT0M/g)).toHaveLength(2)
    // Mismo archivo, mismos UID: al volver a descargarlo no se duplican.
    expect(generarIcs(datos(), VENCE - 2 * DIA).match(/UID:.*/g)).toEqual(ics.match(/UID:.*/g))
  })

  it('sin rondas por delante, un calendario vacío pero válido', () => {
    const ics = generarIcs(datos({ rondaActual: 3 }), VENCE + 10 * MES)
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })
})
