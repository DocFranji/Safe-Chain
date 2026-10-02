import { describe, expect, it } from 'vitest'
import { BOVEDA_AVISO, BOVEDA_CRITICO, evaluarBoveda, evaluarFaucet } from './estado'

const U = 10_000_000n

describe('evaluarBoveda', () => {
  it('error si casi no tiene fondos, aviso si está justa, ok si sobra', () => {
    expect(evaluarBoveda(BOVEDA_CRITICO - 1n).nivel).toBe('error')
    expect(evaluarBoveda(BOVEDA_CRITICO).nivel).toBe('aviso')
    expect(evaluarBoveda(BOVEDA_AVISO - 1n).nivel).toBe('aviso')
    expect(evaluarBoveda(BOVEDA_AVISO).nivel).toBe('ok')
    expect(evaluarBoveda(10_000n * U).nivel).toBe('ok')
  })

  it('cuando no está en verde, explica qué hacer', () => {
    expect(evaluarBoveda(0n).solucion).toMatch(/mint/)
    expect(evaluarBoveda(10_000n * U).solucion).toBeUndefined()
  })
})

describe('evaluarFaucet', () => {
  it('400 con JSON: la función existe y tiene llave (rechazó la dirección falsa)', () => {
    expect(evaluarFaucet(400, { ok: false, error: 'La dirección de la billetera no es válida.' }).nivel).toBe('ok')
  })

  it('503: falta la llave del emisor', () => {
    const r = evaluarFaucet(503, { ok: false, error: 'El faucet no está configurado todavía.' })
    expect(r.nivel).toBe('error')
    expect(r.solucion).toMatch(/FAUCET_ISSUER_SECRET/)
  })

  it('sin JSON (el sitio devolvió una página): no hay función, es solo un aviso', () => {
    expect(evaluarFaucet(200, null).nivel).toBe('aviso')
    expect(evaluarFaucet(404, null).nivel).toBe('aviso')
  })

  it('otros códigos son error', () => {
    expect(evaluarFaucet(502, { ok: false }).nivel).toBe('error')
  })
})
