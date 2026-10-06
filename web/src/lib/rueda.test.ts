import { describe, expect, it } from 'vitest'
import { coloresSinRepetir } from './rueda'

describe('coloresSinRepetir', () => {
  it('ningún asiento tiene el color de sus vecinos, de 3 a 12 personas', () => {
    for (let n = 3; n <= 12; n++) {
      const c = coloresSinRepetir(n)
      for (let i = 0; i < n; i++) {
        expect(c[i], `n=${n} i=${i}`).not.toBe(c[(i + 1) % n])
      }
    }
  })
  it('usa los cuatro colores de la carreta en orden', () => {
    expect(coloresSinRepetir(4)).toEqual([0, 1, 2, 3])
    expect(coloresSinRepetir(5)).toEqual([0, 1, 2, 3, 1])
  })
})
