import { describe, expect, it } from 'vitest'
import { bolsaListaParaCobrar } from './cobro'

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
