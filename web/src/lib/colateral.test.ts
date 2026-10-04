// Estos valores salen de contracts/tanda/src/test.rs. Si alguno falla, la vista previa
// de la web ya no coincide con lo que realmente cobra el contrato.
import { describe, expect, it } from 'vitest'
import {
  bolsa,
  colateralDeTurno,
  multaPorAtraso,
  riesgoMaximo,
  tablaColateral,
  validarParametros,
} from './colateral'
import { aSegundos, parseMonto } from './entradas'

const U = 10_000_000n // 1 TUSD
const CUOTA = 100n * U

describe('colateral escalonado (igual que las pruebas de Rust)', () => {
  it('n=3, cobertura 100%: 200, 100, 100', () => {
    const t = tablaColateral({ cuota: CUOTA, nMiembros: 3, coberturaBps: 10_000 })
    expect(t).toEqual([200n * U, 100n * U, 100n * U])
  })

  it('n=5, cobertura 50%: 200, 150, 100, 100, 100', () => {
    const t = tablaColateral({ cuota: CUOTA, nMiembros: 5, coberturaBps: 5_000 })
    expect(t).toEqual([200n * U, 150n * U, 100n * U, 100n * U, 100n * U])
  })

  it('cobertura 0%: todos dejan una sola cuota', () => {
    const t = tablaColateral({ cuota: CUOTA, nMiembros: 3, coberturaBps: 0 })
    expect(t).toEqual([CUOTA, CUOTA, CUOTA])
  })

  it('el último turno nunca deja menos de una cuota', () => {
    expect(colateralDeTurno({ cuota: CUOTA, nMiembros: 12, coberturaBps: 10_000 }, 11)).toBe(CUOTA)
  })

  it('n=12, cobertura 100%: el primero deja 11 cuotas', () => {
    expect(colateralDeTurno({ cuota: CUOTA, nMiembros: 12, coberturaBps: 10_000 }, 0)).toBe(1_100n * U)
  })

  it('bolsa y multa de la demo: 300 TUSD y 10 TUSD', () => {
    expect(bolsa({ cuota: CUOTA, nMiembros: 3 })).toBe(300n * U)
    expect(multaPorAtraso(CUOTA, 1_000)).toBe(10n * U)
  })
})

describe('riesgoMaximo (lo que el grupo podría perder si alguien huye)', () => {
  it('con garantía del 100% no hay riesgo', () => {
    expect(riesgoMaximo({ cuota: CUOTA, nMiembros: 3, coberturaBps: 10_000 })).toBe(0n)
    expect(riesgoMaximo({ cuota: CUOTA, nMiembros: 12, coberturaBps: 10_000 })).toBe(0n)
  })

  it('con garantía del 0%, el primero se lleva todo lo que aún debe menos una cuota', () => {
    // n=3: debe 2 cuotas, deja 1 de garantía -> quedan 1 cuota sin cubrir
    expect(riesgoMaximo({ cuota: CUOTA, nMiembros: 3, coberturaBps: 0 })).toBe(100n * U)
    // n=5: debe 4 cuotas, deja 1 -> 3 sin cubrir
    expect(riesgoMaximo({ cuota: CUOTA, nMiembros: 5, coberturaBps: 0 })).toBe(300n * U)
  })

  it('n=5 con garantía del 50%: primero debe 400 y deja 200 -> 200 sin cubrir', () => {
    expect(riesgoMaximo({ cuota: CUOTA, nMiembros: 5, coberturaBps: 5_000 })).toBe(200n * U)
  })
})

describe('validarParametros (mismos límites que crear_tanda)', () => {
  const ok = { cuota: CUOTA, nMiembros: 3, periodoSeg: 120, penalidadBps: 1_000, coberturaBps: 10_000 }

  it('acepta la configuración de la demo', () => {
    expect(validarParametros(ok)).toEqual({})
  })

  it('rechaza lo que el contrato rechaza', () => {
    expect(validarParametros({ ...ok, cuota: 0n }).cuota).toBeDefined()
    expect(validarParametros({ ...ok, nMiembros: 2 }).nMiembros).toBeDefined()
    expect(validarParametros({ ...ok, nMiembros: 13 }).nMiembros).toBeDefined()
    expect(validarParametros({ ...ok, periodoSeg: 59 }).periodoSeg).toBeDefined()
    expect(validarParametros({ ...ok, penalidadBps: 5_001 }).penalidadBps).toBeDefined()
    expect(validarParametros({ ...ok, coberturaBps: 10_001 }).coberturaBps).toBeDefined()
  })

  it('acepta justo los límites', () => {
    expect(validarParametros({ ...ok, nMiembros: 12, periodoSeg: 60, penalidadBps: 5_000, coberturaBps: 0 })).toEqual({})
    expect(validarParametros({ ...ok, periodoSeg: 90 * 86_400 })).toEqual({})
  })

  it('la ronda más larga es de 3 meses (90 días), como en el contrato', () => {
    expect(validarParametros({ ...ok, periodoSeg: 90 * 86_400 + 1 }).periodoSeg).toMatch(/3 meses/)
    expect(validarParametros({ ...ok, periodoSeg: aSegundos(4, 'meses') ?? 0 }).periodoSeg).toBeDefined()
  })
})

describe('parseMonto', () => {
  it('convierte a unidades de 7 decimales', () => {
    expect(parseMonto('100')).toBe(1_000_000_000n)
    expect(parseMonto('12,5')).toBe(125_000_000n)
    expect(parseMonto('0.0000001')).toBe(1n)
    expect(parseMonto(' 7 ')).toBe(70_000_000n)
  })

  it('rechaza entradas inválidas', () => {
    for (const malo of ['', 'abc', '-5', '1.2.3', '1e3', '0.12345678', '9999999999']) {
      expect(parseMonto(malo)).toBeNull()
    }
  })
})

describe('duraciones', () => {
  it('convierte a segundos', () => {
    expect(aSegundos(2, 'minutos')).toBe(120)
    expect(aSegundos(1, 'horas')).toBe(3_600)
    expect(aSegundos(7, 'dias')).toBe(604_800)
    expect(aSegundos(2, 'semanas')).toBe(1_209_600)
    expect(aSegundos(1, 'meses')).toBe(2_592_000) // 1 mes = 30 días
    expect(aSegundos(0, 'dias')).toBeNull()
    expect(aSegundos(1.5, 'horas')).toBeNull()
  })
})
