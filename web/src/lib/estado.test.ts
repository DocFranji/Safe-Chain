import { describe, expect, it } from 'vitest'
import { evaluarFaucet } from './estado'

// Las bóvedas se prueban en bovedas.test.ts (misión M1).

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
