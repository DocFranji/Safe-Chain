import { describe, expect, it } from 'vitest'
import type { ResumenTanda } from './lectura'
import { esMiTandaConLugar } from './misTandas'

const r = (estado: string, creador: string, miembros: string[], n = 3) =>
  ({ tanda: { estado: { tag: estado }, creador, n_miembros: n }, miembros: miembros.map((direccion) => ({ direccion })) }) as unknown as Pick<ResumenTanda, 'tanda' | 'miembros'>

describe('esMiTandaConLugar', () => {
  it('abierta, mía (la creé o estoy) y con lugares libres', () => {
    expect(esMiTandaConLugar(r('Abierta', 'GYO', []), 'GYO')).toBe(true)
    expect(esMiTandaConLugar(r('Abierta', 'GANA', ['GYO']), 'GYO')).toBe(true)
  })
  it('no si es de otra persona, si se llenó o si ya no está abierta', () => {
    expect(esMiTandaConLugar(r('Abierta', 'GANA', ['GBETO']), 'GYO')).toBe(false)
    expect(esMiTandaConLugar(r('Abierta', 'GYO', ['GYO', 'GA', 'GB']), 'GYO')).toBe(false)
    expect(esMiTandaConLugar(r('Activa', 'GYO', ['GYO']), 'GYO')).toBe(false)
    expect(esMiTandaConLugar(r('Cancelada', 'GYO', []), 'GYO')).toBe(false)
  })
})
