import { describe, expect, it } from 'vitest'
import type { ContractEvent } from 'tanda'
import { narrar, ordenar, type EventoTanda, type Formato } from './historia'

const U = 10_000_000n
const NOMBRES: Record<string, string> = { GANA: 'Ana', GBETO: 'Beto', GCARLA: 'Carla' }
const f: Formato = {
  nombre: (d) => NOMBRES[d] ?? d,
  monto: (v) => String(v / U),
  simbolo: 'TUSD',
}

let n = 0
const ev = (evento: ContractEvent): EventoTanda => ({
  id: String(++n).padStart(6, '0'),
  ledger: 100 + n,
  cerradoEn: '2026-10-02T03:00:00Z',
  evento,
})

describe('narrar: la historia de la demo', () => {
  it('cuenta que la garantía de Ana cubrió su cuota (el momento clave)', () => {
    const [h] = narrar(
      [ev({ name: 'EvCubierto', data: { id: 1, miembro: 'GANA', ronda: 1, monto: 100n * U } })],
      f,
    )
    expect(h.tipo).toBe('clave')
    expect(h.titulo).toBe('Ana no pagó: su garantía cubrió 100 TUSD')
    expect(h.detalle).toContain('Ronda 2')
    expect(h.detalle).toContain('el grupo no pierde nada')
  })

  it('distingue pagar a tiempo de pagar tarde', () => {
    const [a, b] = narrar(
      [
        ev({ name: 'EvPago', data: { id: 1, miembro: 'GBETO', ronda: 0, tarde: false } }),
        ev({ name: 'EvPago', data: { id: 1, miembro: 'GBETO', ronda: 2, tarde: true } }),
      ],
      f,
    )
    expect(a).toMatchObject({ tipo: 'pago', titulo: 'Beto pagó su cuota', detalle: 'Ronda 1' })
    expect(b).toMatchObject({ tipo: 'alerta', titulo: 'Beto pagó tarde' })
    expect(b.detalle).toContain('Ronda 3')
  })

  it('cierra la ronda: quien cobra recibe la bolsa; si es moroso, queda retenida', () => {
    const [cobra, retenida] = narrar(
      [
        ev({ name: 'EvRonda', data: { id: 1, ronda: 0, beneficiario: 'GANA', monto_pagado: 300n * U } }),
        ev({ name: 'EvRonda', data: { id: 1, ronda: 2, beneficiario: 'GCARLA', monto_pagado: 0n } }),
      ],
      f,
    )
    expect(cobra).toMatchObject({ tipo: 'ok', titulo: 'Ana cobró 300 TUSD', detalle: 'Se cerró la ronda 1' })
    expect(retenida).toMatchObject({ tipo: 'alerta', titulo: 'La bolsa de la ronda 3 quedó retenida' })
    expect(retenida.detalle).toContain('Carla está en mora')
  })

  it('liquidación: quien recibe dinero y quien ya gastó toda su garantía', () => {
    const [recibe, nada] = narrar(
      [
        ev({ name: 'EvLiquidado', data: { id: 1, miembro: 'GCARLA', monto: 114n * U } }),
        ev({ name: 'EvLiquidado', data: { id: 1, miembro: 'GANA', monto: 0n } }),
      ],
      f,
    )
    expect(recibe).toMatchObject({ tipo: 'ok', titulo: 'Carla recibió 114 TUSD al final' })
    expect(nada).toMatchObject({ tipo: 'info', titulo: 'Ana no recibió nada al final' })
  })

  it('mora, creación, unión, inicio, final y cancelación', () => {
    const h = narrar(
      [
        ev({ name: 'EvCreada', data: { id: 1, creador: 'GANA', cuota: 100n * U, n_miembros: 3 } }),
        ev({ name: 'EvUnido', data: { id: 1, miembro: 'GANA', posicion: 0, colateral: 200n * U } }),
        ev({ name: 'EvIniciada', data: { id: 1, inicio_ronda: 1n } }),
        ev({ name: 'EvMoroso', data: { id: 1, miembro: 'GBETO', deuda: 50n * U } }),
        ev({ name: 'EvFinalizada', data: { id: 1, rendimiento: 8n * U, fondo_premios: 10n * U, retenido: 0n, sin_repartir: 0n } }),
        ev({ name: 'EvCancelada', data: { id: 2 } }),
      ],
      f,
    )
    expect(h.map((x) => x.titulo)).toEqual([
      'Se creó la tanda',
      'Ana se unió',
      'Se completó el cupo: arranca la ronda 1',
      'Beto quedó en mora',
      'Tanda terminada',
      'La tanda se canceló',
    ])
    expect(h[0].detalle).toBe('3 personas · cuota de 100 TUSD')
    expect(h[1].detalle).toBe('Turno 1 · dejó 200 TUSD de garantía')
    expect(h[3].detalle).toContain('debe 50 TUSD')
    expect(h[4].detalle).toBe('rendimiento 8 TUSD · multas repartidas 10 TUSD')
  })

  it('ordena cronológicamente aunque lleguen desordenados', () => {
    const a = ev({ name: 'EvIniciada', data: { id: 1 } })
    const b = ev({ name: 'EvCancelada', data: { id: 1 } })
    expect(ordenar([b, a]).map((x) => x.id)).toEqual([a.id, b.id])
  })

  it('no se rompe si faltan datos', () => {
    const [h] = narrar([ev({ name: 'EvCubierto', data: { id: 1 } })], f)
    expect(h.titulo).toBe('Alguien no pagó: su garantía cubrió —')
  })
})

describe('narrar: pagar deudas (M1)', () => {
  it('"Ana pagó su deuda" y "Carla recibió lo que le faltaba" son momentos clave', () => {
    const [pago, abono] = narrar(
      [
        ev({ name: 'EvDeudaPagada', data: { id: 1, miembro: 'GANA', pagador: 'GANA', monto: 100n * U, deuda_restante: 0n } }),
        ev({ name: 'EvAbono', data: { id: 1, deudor: 'GANA', acreedor: 'GCARLA', ronda: 2, monto: 100n * U, retenida: false } }),
      ],
      f,
    )
    expect(pago).toMatchObject({ tipo: 'clave', titulo: 'Ana pagó 100 TUSD y saldó su deuda', detalle: 'vuelve a estar al día' })
    expect(abono).toMatchObject({ tipo: 'clave', titulo: 'Carla recibió los 100 TUSD que le faltaban', detalle: 'Ronda 3: lo pagó Ana' })
  })

  it('pago parcial, pagado por otra persona', () => {
    const [h] = narrar(
      [ev({ name: 'EvDeudaPagada', data: { id: 1, miembro: 'GANA', pagador: 'GBETO', monto: 30n * U, deuda_restante: 70n * U } })],
      f,
    )
    expect(h).toMatchObject({ tipo: 'pago', titulo: 'Ana pagó 30 TUSD de su deuda', detalle: 'La pagó Beto · le faltan 70 TUSD' })
  })

  it('abono a una bolsa retenida y bolsa recuperada', () => {
    const [abono, rec] = narrar(
      [
        ev({ name: 'EvAbono', data: { id: 1, deudor: 'GANA', acreedor: 'GCARLA', ronda: 2, monto: 100n * U, retenida: true } }),
        ev({ name: 'EvBolsaRecuperada', data: { id: 1, miembro: 'GCARLA', monto: 190n * U, multas: 10n * U, garantia: 100n * U } }),
      ],
      f,
    )
    expect(abono).toMatchObject({ tipo: 'info', titulo: '100 TUSD se sumaron a la bolsa retenida de Carla' })
    expect(rec).toMatchObject({ tipo: 'ok', titulo: 'Carla recuperó su bolsa: 190 TUSD' })
    expect(rec.detalle).toBe('Se descontaron 10 TUSD de multas · 100 TUSD quedan como su garantía para las cuotas que le faltan')
  })
})

describe('narrar: historial crediticio (M2)', () => {
  it('cuenta los requisitos de historial de la tanda', () => {
    const [con, sin, conectado] = narrar(
      [
        ev({ name: 'EvRequisitos', data: { id: 1, puntaje_minimo: 100, descuento: true } }),
        ev({ name: 'EvRequisitos', data: { id: 1, puntaje_minimo: 0, descuento: false } }),
        ev({ name: 'EvHistorialConfigurado', data: { historial: 'C' } }),
      ],
      f,
    )
    expect(con.titulo).toBe('La tanda usa el historial crediticio')
    expect(con.detalle).toBe('Esta tanda pide historial con 100 puntos o más y da descuento de garantía por buen historial')
    expect(sin.titulo).toBe('La tanda no usa el historial crediticio')
    expect(conectado.titulo).toBe('Se conectó el historial crediticio')
  })
})

// --- M4: bóveda por token ---
describe('narrar: bóveda por token (M4)', () => {
  it('cuenta el cambio de bóveda de una moneda como información', () => {
    const [h] = narrar([ev({ name: 'EvBovedaToken', data: { token: 'CUSDC', boveda: 'CBLEND' } })], f)
    expect(h).toMatchObject({ tipo: 'info', titulo: 'Se cambió la bóveda de una moneda para las tandas nuevas' })
  })
})
