import { describe, expect, it } from 'vitest'
import { conEventos, esFija, hayQueReleer } from './lecturaNotificaciones'
import type { TandaParaAvisos } from './notificaciones'

const AHORA = 1_793_718_000

describe('hayQueReleer: qué tandas se vuelven a leer en cada vuelta', () => {
  it('lo que nunca se leyó, sí', () => {
    expect(hayQueReleer(undefined, AHORA)).toBe(true)
  })

  it('lo que ya no cambia, nunca', () => {
    expect(hayQueReleer({ mia: true, fija: true, leidaEn: 0 }, AHORA)).toBe(false)
    expect(hayQueReleer({ mia: false, fija: true, leidaEn: 0 }, AHORA, true)).toBe(false)
  })

  it('las vivas de la persona y las de sus invitaciones, siempre', () => {
    expect(hayQueReleer({ mia: true, fija: false, leidaEn: AHORA }, AHORA)).toBe(true)
    expect(hayQueReleer({ mia: false, fija: false, leidaEn: AHORA }, AHORA, true)).toBe(true)
  })

  it('las demás tandas abiertas, solo cada minuto', () => {
    expect(hayQueReleer({ mia: false, fija: false, leidaEn: AHORA - 59 }, AHORA)).toBe(false)
    expect(hayQueReleer({ mia: false, fija: false, leidaEn: AHORA - 60 }, AHORA)).toBe(true)
  })
})

describe('esFija: cuándo una tanda ya no cambia para la campanita', () => {
  it('terminada o cancelada: siempre', () => {
    expect(esFija('Finalizada', true)).toBe(true)
    expect(esFija('Cancelada', false)).toBe(true)
  })

  it('en curso donde la persona no está: sí, porque nadie más puede unirse', () => {
    expect(esFija('Activa', false)).toBe(true)
    expect(esFija('PorLiquidar', false)).toBe(true)
  })

  it('en curso donde la persona sí está, y las abiertas: no', () => {
    expect(esFija('Activa', true)).toBe(false)
    expect(esFija('PorLiquidar', true)).toBe(false)
    expect(esFija('Abierta', true)).toBe(false)
    expect(esFija('Abierta', false)).toBe(false)
  })
})

describe('conEventos: de qué tandas de la persona vale la pena buscar los eventos', () => {
  const tanda = (tag: TandaParaAvisos['tanda']['estado']['tag'], finDeLaUltimaRonda = AHORA): TandaParaAvisos => ({
    id: 1,
    tanda: {
      estado: { tag, values: undefined } as TandaParaAvisos['tanda']['estado'],
      creador: 'GANA',
      cuota: 0n,
      n_miembros: 3,
      penalidad_bps: 0,
      periodo_seg: 100n,
      inicio_ronda: BigInt(finDeLaUltimaRonda - 100),
      ronda_actual: 0,
    },
    miembros: [],
    pagaron: [],
    vence: 0,
    modo: 'Llegada',
  })

  it('las que están en curso, sí; las abiertas y las canceladas, no', () => {
    expect(conEventos(tanda('Activa'), AHORA)).toBe(true)
    expect(conEventos(tanda('PorLiquidar'), AHORA)).toBe(true)
    expect(conEventos(tanda('Abierta'), AHORA)).toBe(false)
    expect(conEventos(tanda('Cancelada'), AHORA)).toBe(false)
  })

  it('una terminada, mientras la red todavía guarde sus eventos (unos 7 días)', () => {
    expect(conEventos(tanda('Finalizada', AHORA - 6 * 86_400), AHORA)).toBe(true)
    expect(conEventos(tanda('Finalizada', AHORA - 8 * 86_400), AHORA)).toBe(false)
  })
})
