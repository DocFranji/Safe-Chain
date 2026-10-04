// Estos valores salen de contracts/tanda/src/test_turnos.rs. Si alguno falla, la vista previa
// de los modos de turnos ya no coincide con lo que realmente hace el contrato.
import { describe, expect, it } from 'vitest'
import {
  OPCIONES_CLASICAS,
  SIN_TURNO,
  aContrato,
  bpsDesdeTexto,
  descuentoDe,
  esClasica,
  intercambiable,
  pideHistorial,
  primaDeTurno,
  siguienteDelRespaldo,
  turnoAlCrear,
  turnosLibres,
  validarOpciones,
  vistaPrevia,
  type OpcionesForm,
} from './turnos'

const U = 10_000_000n // 1 TUSD
const CUOTA = 100n * U
const base = { cuota: CUOTA, nMiembros: 3, periodoSeg: 120, penalidadBps: 1000, coberturaBps: 10_000 }
const con = (o: Partial<OpcionesForm>): OpcionesForm => ({ ...OPCIONES_CLASICAS, ...o })

describe('precio por turno (prima de suma cero)', () => {
  it('3 personas, prima 8 %: el turno 1 paga 24, el 2 nada y el 3 recibe 24', () => {
    expect([0, 1, 2].map((i) => primaDeTurno(base, 800, i))).toEqual([24n * U, 0n, -24n * U])
  })

  it('12 personas, prima 20 %: el primero paga 240 y todas suman cero', () => {
    const p = { cuota: CUOTA, nMiembros: 12 }
    const primas = Array.from({ length: 12 }, (_, i) => primaDeTurno(p, 2_000, i))
    expect(primas[0]).toBe(240n * U)
    expect(primas[11]).toBe(-240n * U)
    expect(primas.reduce((a, b) => a + b, 0n)).toBe(0n)
  })

  it('vista previa: 276, 300 y 324', () => {
    const filas = vistaPrevia(base, con({ modo: 'PrecioPorTurno', primaPct: 8 }))
    expect(filas.map((f) => f.recibe)).toEqual([276n * U, 300n * U, 324n * U])
    expect(filas.map((f) => f.alUnirse)).toEqual([200n * U, 100n * U, 100n * U])
  })
})

describe('garantía en sorteo y subasta: una cuota al unirse, el resto al cobrar', () => {
  it('3 personas, cobertura 100 %: se aparta 100 al primero, que recibe 200 en efectivo', () => {
    const filas = vistaPrevia(base, con({ modo: 'Sorteo' }))
    expect(filas.map((f) => f.alUnirse)).toEqual([CUOTA, CUOTA, CUOTA])
    expect(filas.map((f) => f.apartado)).toEqual([100n * U, 0n, 0n])
    expect(filas.map((f) => f.recibe)).toEqual([200n * U, 300n * U, 300n * U])
  })

  it('12 personas, cobertura 100 %: el primero recibe 200 y se le apartan 1 000', () => {
    const f = vistaPrevia({ ...base, nMiembros: 12 }, con({ modo: 'Subasta' }))[0]
    expect(f.apartado).toBe(1_000n * U)
    expect(f.recibe).toBe(200n * U)
  })

  it('en llegada todo se deja al unirse, como siempre', () => {
    const filas = vistaPrevia(base, OPCIONES_CLASICAS)
    expect(filas.map((f) => f.apartado)).toEqual([0n, 0n, 0n])
    expect(filas.map((f) => f.recibe)).toEqual([300n * U, 300n * U, 300n * U])
  })
})

describe('opciones', () => {
  it('llegada sin intercambio se crea con crear_tanda', () => {
    expect(esClasica(OPCIONES_CLASICAS)).toBe(true)
    expect(esClasica(con({ intercambio: true }))).toBe(false)
  })

  it('cada modo manda solo sus parámetros (como exige el contrato)', () => {
    expect(aContrato(con({ modo: 'PrecioPorTurno', primaPct: 8, intercambio: true }))).toEqual({
      modo: { tag: 'PrecioPorTurno', values: undefined },
      permitir_intercambio: true,
      prima_max_bps: 800,
      descuento_max_bps: 0,
      primeros_con_historial: 0,
      puntaje_primeros: 0,
    })
    expect(aContrato(con({ modo: 'Subasta', descuentoPct: 30, intercambio: true }))).toEqual({
      modo: { tag: 'Subasta', values: undefined },
      permitir_intercambio: false,
      prima_max_bps: 0,
      descuento_max_bps: 3000,
      primeros_con_historial: 0,
      puntaje_primeros: 0,
    })
  })

  it('límites: prima 1–20 %, descuento 1–50 %', () => {
    expect(validarOpciones(con({ modo: 'PrecioPorTurno', primaPct: 0 }))).not.toBeNull()
    expect(validarOpciones(con({ modo: 'PrecioPorTurno', primaPct: 21 }))).not.toBeNull()
    expect(validarOpciones(con({ modo: 'PrecioPorTurno', primaPct: 20 }))).toBeNull()
    expect(validarOpciones(con({ modo: 'Subasta', descuentoPct: 51 }))).not.toBeNull()
    expect(validarOpciones(con({ modo: 'Subasta', descuentoPct: 50 }))).toBeNull()
    expect(validarOpciones(con({ modo: 'Sorteo', primaPct: 99 }))).toBeNull()
  })
})

describe('los primeros turnos piden historial (M2 + M3)', () => {
  const protegida = con({ modo: 'PrecioPorTurno', primaPct: 8, primeros: 2, puntajePrimeros: 100 })

  it('solo donde se elige turno; en los demás modos no se manda', () => {
    expect(aContrato(protegida)).toMatchObject({ primeros_con_historial: 2, puntaje_primeros: 100 })
    expect(aContrato({ ...protegida, modo: 'Eleccion' })).toMatchObject({ primeros_con_historial: 2, puntaje_primeros: 100 })
    for (const modo of ['Llegada', 'Sorteo', 'Subasta'] as const) {
      expect(aContrato({ ...protegida, modo })).toMatchObject({ primeros_con_historial: 0, puntaje_primeros: 0 })
    }
    expect(esClasica({ ...protegida, modo: 'Llegada' })).toBe(true)
  })

  it('deja al menos un turno para cualquiera y pide un puntaje', () => {
    expect(validarOpciones(protegida, 3)).toBeNull()
    expect(validarOpciones({ ...protegida, primeros: 3 }, 3)).toMatch(/al menos un turno/)
    expect(validarOpciones({ ...protegida, puntajePrimeros: 0 }, 3)).not.toBeNull()
    // En sorteo no aplica, así que no molesta.
    expect(validarOpciones({ ...protegida, modo: 'Sorteo', primeros: 9 }, 3)).toBeNull()
  })

  it('qué turnos piden historial y dónde queda quien crea', () => {
    const o = { primeros_con_historial: 2 }
    expect([0, 1, 2].map((i) => pideHistorial(o, i))).toEqual([true, true, false])
    expect(pideHistorial(null, 0)).toBe(false)
    expect(turnoAlCrear(protegida, 110)).toBe(0)
    expect(turnoAlCrear(protegida, 50)).toBe(2)
    expect(turnoAlCrear({ ...protegida, modo: 'Sorteo' }, 0)).toBe(0)
  })

  it('la vista previa marca los turnos que piden historial', () => {
    expect(vistaPrevia(base, protegida).map((f) => f.pideHistorial)).toEqual([true, true, false])
    expect(vistaPrevia(base, { ...protegida, primeros: 0 }).some((f) => f.pideHistorial)).toBe(false)
  })
})

describe('turnos en la tanda', () => {
  const m = (direccion: string, posicion: number, o: Partial<{ cobro: boolean; moroso: boolean }> = {}) => ({
    direccion,
    posicion,
    cobro: false,
    moroso: false,
    ...o,
  })

  it('turnos libres', () => {
    expect(turnosLibres(4, [1, 3])).toEqual([0, 2])
    expect(turnosLibres(3, [SIN_TURNO])).toEqual([0, 1, 2])
  })

  it('solo se intercambia un turno futuro, sin haber cobrado ni estar en mora', () => {
    expect(intercambiable(m('a', 2), 1)).toBe(true)
    expect(intercambiable(m('a', 1), 1)).toBe(false)
    expect(intercambiable(m('a', SIN_TURNO), 0)).toBe(false)
    expect(intercambiable(m('a', 2, { moroso: true }), 0)).toBe(false)
  })

  it('subasta sin ofertas: el primero del respaldo que aún no tiene turno y está al día', () => {
    const miembros = [m('ana', 0), m('beto', SIN_TURNO, { moroso: true }), m('carla', SIN_TURNO)]
    expect(siguienteDelRespaldo(['ana', 'beto', 'carla'], miembros)).toBe('carla')
    expect(siguienteDelRespaldo(['ana'], miembros)).toBeNull()
  })

  it('descuento y porcentajes escritos por la persona', () => {
    expect(descuentoDe(300n * U, 1_000)).toBe(30n * U)
    expect(bpsDesdeTexto('8,5')).toBe(850)
    expect(bpsDesdeTexto('10 %')).toBe(1000)
    expect(bpsDesdeTexto('abc')).toBeNull()
    expect(bpsDesdeTexto('1.234')).toBeNull()
  })
})
