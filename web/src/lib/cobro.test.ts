import { describe, expect, it } from 'vitest'
import { bolsaListaParaCobrar, puedeCerrarAntes } from './cobro'

const tanda = (o = {}) => ({ estado: { tag: 'Activa' }, ronda_actual: 1, inicio_ronda: 1_000n, periodo_seg: 600n, ...o })
const miembros = [
  { direccion: 'ANA', posicion: 0, moroso: false },
  { direccion: 'YO', posicion: 1, moroso: false },
]

describe('bolsaListaParaCobrar', () => {
  it('solo cuando venció la ronda y me toca a mí', () => {
    expect(bolsaListaParaCobrar(tanda(), miembros, 'YO', 1_600)).toBe(true)
    expect(bolsaListaParaCobrar(tanda(), miembros, 'YO', 1_599)).toBe(false) // todavía no vence
    expect(bolsaListaParaCobrar(tanda(), miembros, 'ANA', 1_600)).toBe(false) // le toca a otra persona
    expect(bolsaListaParaCobrar(tanda(), miembros, null, 1_600)).toBe(false) // nadie conectado
  })

  it('no si la tanda no está en curso o si mi bolsa queda retenida por deuda', () => {
    expect(bolsaListaParaCobrar(tanda({ estado: { tag: 'PorLiquidar' } }), miembros, 'YO', 9_999)).toBe(false)
    const moroso = [miembros[0], { ...miembros[1], moroso: true }]
    expect(bolsaListaParaCobrar(tanda(), moroso, 'YO', 1_600)).toBe(false)
  })
})

describe('puedeCerrarAntes (M1 v4)', () => {
  const t = (o = {}) => ({ ...tanda(), n_miembros: 3, ...o })

  it('si todos pagaron y la ronda no ha vencido', () => {
    expect(puedeCerrarAntes(t(), 3, 'Llegada', 1_100)).toBe(true)
    expect(puedeCerrarAntes(t(), 2, 'Llegada', 1_100)).toBe(false) // falta alguien
    expect(puedeCerrarAntes(t(), 3, 'Llegada', 1_600)).toBe(false) // ya venció: es el cierre normal
    expect(puedeCerrarAntes(t({ estado: { tag: 'PorLiquidar' } }), 3, 'Llegada', 1_100)).toBe(false)
  })

  it('en cualquier modo de turnos menos la subasta', () => {
    for (const modo of ['Llegada', 'Eleccion', 'PrecioPorTurno', 'Sorteo']) {
      expect(puedeCerrarAntes(t(), 3, modo, 1_100)).toBe(true)
    }
    expect(puedeCerrarAntes(t(), 3, 'Subasta', 1_100)).toBe(false)
  })

  it('tras un cierre anticipado, la ronda siguiente (que empieza en el futuro) también, con tope de 120 días', () => {
    const mes = 30 * 86_400
    // Ya se adelantaron 2 rondas mensuales: la siguiente vencería a 120 días (sí); con 3, a 150 (no).
    expect(puedeCerrarAntes(t({ inicio_ronda: 2n * BigInt(mes), periodo_seg: BigInt(mes) }), 3, 'Llegada', 0)).toBe(true)
    expect(puedeCerrarAntes(t({ inicio_ronda: 3n * BigInt(mes), periodo_seg: BigInt(mes) }), 3, 'Llegada', 0)).toBe(false)
  })
})
