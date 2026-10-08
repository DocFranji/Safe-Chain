import { describe, expect, it } from 'vitest'
import { arcoCentrado, orbita, segmentoAnular } from './geometria'

describe('segmentoAnular', () => {
  it('dibuja un trazo cerrado con dos arcos', () => {
    const d = segmentoAnular(5, 90, 150)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.match(/A /g)).toHaveLength(2)
  })
  it('con una o dos personas usa el arco largo cuando hace falta', () => {
    expect(segmentoAnular(1, 90, 150)).toContain(' 0 1 1 ')
    expect(segmentoAnular(12, 90, 150)).toContain(' 0 0 1 ')
  })
  it('es simétrico: arranca y termina a la misma altura', () => {
    const [x1, y1] = segmentoAnular(4, 90, 150).slice(2).split(' ').map(Number)
    expect(x1).toBeLessThan(0)
    expect(y1).toBeLessThan(0)
  })
})

describe('orbita', () => {
  it('gira, se aleja y se endereza', () => {
    expect(orbita(72, 120).transform).toBe('rotate(72deg) translate(0px, -120px) rotate(-72deg)')
  })
})

describe('arcoCentrado', () => {
  it('es un solo arco abierto, simétrico respecto al centro', () => {
    const d = arcoCentrado(6, 140)
    expect(d.match(/A /g)).toHaveLength(1)
    expect(d.endsWith('Z')).toBe(false)
    // "M x1 y1 A r r 0 0 1 x2 y2"
    const n = d.replace(/[MA]/g, '').trim().split(/\s+/).map(Number)
    expect(n).toHaveLength(9)
    expect(n[0]).toBeCloseTo(-n[7], 1)
    expect(n[1]).toBeCloseTo(n[8], 1)
  })
})
