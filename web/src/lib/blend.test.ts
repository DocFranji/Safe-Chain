import { describe, expect, it } from 'vitest'
import { alcanzaLiquidez, liquidezDeReserva, MENSAJES_BLEND, textoLiquidez } from './blend'

// Reserva USDC real del pool TestnetV2 de Blend (get_reserve en el ledger 5 010 415, 4 oct 2026).
const USDC_TESTNET = {
  data: {
    b_rate: 1_057_093_452_174n,
    b_supply: 1_233_144_597_233n,
    d_rate: 1_071_038_390_182n,
    d_supply: 951_428_962_745n,
  },
}

describe('liquidezDeReserva', () => {
  it('calcula depositado, prestado, libre y utilización como Blend', () => {
    const l = liquidezDeReserva(USDC_TESTNET)
    // 130 355 USDC depositados, 101 902 prestados (redondeado hacia arriba), 28 453 libres, 78,17 %.
    expect(l.depositado).toBe(1_303_549_079_318n)
    expect(l.prestado).toBe(1_019_016_944_631n)
    expect(l.libre).toBe(284_532_134_687n)
    expect(l.utilizacion).toBe(78.17)
  })

  it('nunca da liquidez negativa (reserva prestada al 100 %)', () => {
    const l = liquidezDeReserva({
      data: { b_rate: 10n ** 12n, b_supply: 100n, d_rate: 10n ** 12n, d_supply: 150n },
    })
    expect(l.libre).toBe(0n)
    expect(l.utilizacion).toBe(150)
  })

  it('reserva vacía: nada depositado ni libre', () => {
    const l = liquidezDeReserva({ data: { b_rate: 10n ** 12n, b_supply: 0n, d_rate: 10n ** 12n, d_supply: 0n } })
    expect(l).toEqual({ depositado: 0n, prestado: 0n, libre: 0n, utilizacion: 0 })
  })
})

describe('textoLiquidez y alcanzaLiquidez', () => {
  const l = { depositado: 1_303_540_000_000n, prestado: 1_019_010_000_000n, libre: 284_530_000_000n, utilizacion: 78.17 }

  it('dice cuánto hay libre, en palabras', () => {
    const miles = (28_453).toLocaleString('es-CR')
    expect(textoLiquidez(l, 'USDC')).toBe(`Blend tiene ${miles} USDC libres para retirar (78 % prestado).`)
  })

  it('un retiro necesita que quede algo libre después (Blend no deja llegar al 100 %)', () => {
    expect(alcanzaLiquidez(l, 400_000_000n)).toBe(true)
    expect(alcanzaLiquidez(l, l.libre)).toBe(false)
  })
})

describe('MENSAJES_BLEND', () => {
  it('tiene mensaje para los errores del adaptador y los de Blend que pueden llegar', () => {
    for (const codigo of [50, 51, 52, 53, 1206, 1207, 1220, 1223]) {
      expect(MENSAJES_BLEND[codigo]).toBeTruthy()
    }
  })
})
