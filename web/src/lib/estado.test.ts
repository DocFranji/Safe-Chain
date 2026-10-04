import { describe, expect, it } from 'vitest'
import { Networks, xdr } from '@stellar/stellar-sdk'
import { Client } from 'tanda'
import { BOVEDA_AVISO, BOVEDA_CRITICO, evaluarBoveda, evaluarFaucet, evaluarInterfaz, interfazDe } from './estado'

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

describe('evaluarInterfaz (M3): la web y el contrato desplegado coinciden', () => {
  // La interfaz que espera la web: la del cliente generado.
  const entradas = new Client({ contractId: 'C'.padEnd(56, 'A'), networkPassphrase: Networks.TESTNET, rpcUrl: 'https://x.test' })
    .spec.entries
  const esperada = interfazDe(entradas)
  const nombre = (e: xdr.ScSpecEntry) => interfazDe([e])[0]?.nombre

  it('el mismo contrato coincide (y los eventos no cuentan)', () => {
    const r = evaluarInterfaz(esperada, esperada)
    expect(r.nivel).toBe('ok')
    expect(esperada.some((p) => p.nombre === 'crear_tanda_avanzada')).toBe(true)
    expect(esperada.some((p) => p.nombre === 'OpcionesTanda')).toBe(true)
  })

  it('un contrato viejo, sin funciones nuevas, es un error que dice cuáles faltan', () => {
    const viejo = interfazDe(entradas.filter((e) => !['crear_tanda_avanzada', 'ofertar'].includes(nombre(e) ?? '')))
    const r = evaluarInterfaz(viejo, esperada)
    expect(r.nivel).toBe('error')
    expect(r.detalle).toMatch(/2 partes/)
    expect(r.detalle).toMatch(/crear_tanda_avanzada/)
    expect(r.solucion).toMatch(/VITE_TANDA_ID/)
  })

  it('un tipo con un campo menos (mismo nombre) también se detecta', () => {
    const sinCampo = entradas.map((e) => {
      if (e.type !== 'scSpecEntryUdtStructV0' || e.udtStructV0.name.toString() !== 'OpcionesTanda') return e
      const w = e.toXdrObject()
      return xdr.ScSpecEntry.fromXdrObject({ ...w, udtStructV0: { ...w.udtStructV0, fields: w.udtStructV0.fields.slice(1) } })
    })
    const r = evaluarInterfaz(interfazDe(sinCampo), esperada)
    expect(r.nivel).toBe('error')
    expect(r.detalle).toMatch(/OpcionesTanda/)
  })

  it('cambiar solo un comentario no es un error', () => {
    const otroDoc = entradas.map((e) => {
      if (e.type !== 'scSpecEntryFunctionV0') return e
      const w = e.toXdrObject()
      return xdr.ScSpecEntry.fromXdrObject({ ...w, functionV0: { ...w.functionV0, doc: new xdr.XdrString('otro comentario') } })
    })
    expect(evaluarInterfaz(interfazDe(otroDoc), esperada).nivel).toBe('ok')
  })
})
