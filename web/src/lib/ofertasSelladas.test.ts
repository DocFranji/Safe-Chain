import { describe, expect, it } from 'vitest'
import { aHex, calcularSello, claveOferta, desdeHex, faseSellada, nuevaSal } from './ofertasSelladas'

describe('ofertas selladas: el mismo sello que el contrato', () => {
  it('vector de prueba compartido con contracts/tanda/src/test_turnos.rs (calculado aparte con Python)', async () => {
    const sello = await calcularSello(800, new Uint8Array(32).fill(7))
    expect(aHex(sello)).toBe('ec6167df08b266996e1247440f69a02076687cea911155305c6feec3c5ba88d7')
  })

  it('otra sal u otro porcentaje dan otro sello', async () => {
    const sal = new Uint8Array(32).fill(7)
    const base = aHex(await calcularSello(800, sal))
    expect(aHex(await calcularSello(801, sal))).not.toBe(base)
    expect(aHex(await calcularSello(800, new Uint8Array(32).fill(8)))).not.toBe(base)
  })

  it('la sal es de 32 bytes, al azar, y se guarda en hexadecimal sin perder nada', () => {
    const a = nuevaSal()
    expect(a.length).toBe(32)
    expect(aHex(a)).not.toBe(aHex(nuevaSal()))
    expect(desdeHex(aHex(a))).toEqual(a)
  })

  it('una oferta por contrato, tanda, ronda y persona', () => {
    expect(claveOferta('CTANDA', 9, 2, 'GYO')).toBe('rounda:oferta-sellada:CTANDA:9:2:GYO')
  })

  it('fases: sellar hasta la mitad, revelar hasta que vence', () => {
    expect(faseSellada(100, 160, 220)).toBe('sellar')
    expect(faseSellada(160, 160, 220)).toBe('revelar')
    expect(faseSellada(220, 160, 220)).toBe('revelar')
    expect(faseSellada(221, 160, 220)).toBe('cerrada')
  })
})
