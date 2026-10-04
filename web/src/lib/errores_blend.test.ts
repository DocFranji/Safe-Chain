import { describe, expect, it } from 'vitest'
import { traducirError } from './contrato'

// Errores de la misión M4: los del adaptador de Blend (50–53) y los de Blend v2 llegan tal cual al
// firmar una operación de una tanda en USDC; los de la bóveda por token (55, 56) son de la tanda.
describe('traducirError (Blend y bóveda por token)', () => {
  it('traduce los errores de Blend y del adaptador por código', () => {
    expect(traducirError(new Error('HostError: Error(Contract, #1207)'))).toMatch(/Blend no tiene liquidez/)
    expect(traducirError(new Error('Error(Contract, #1206)'))).toMatch(/no está aceptando depósitos/)
    expect(traducirError(new Error('Error(Contract, #53)'))).toMatch(/no se movió dinero/)
    for (const codigo of [50, 51, 52, 53, 55, 56, 1206, 1207, 1220, 1223]) {
      expect(traducirError(new Error(`Error(Contract, #${codigo})`))).not.toMatch(/rechazó la operación/)
    }
  })

  it('traduce los errores nuevos de la tanda también por nombre', () => {
    expect(traducirError(new Error('TokenSinBoveda'))).toBe('Esa moneda todavía no se puede usar en tandas.')
    expect(traducirError(new Error('BovedaDeOtroToken'))).toMatch(/guarda otra moneda/)
  })
})
