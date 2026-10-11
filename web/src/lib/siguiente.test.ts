import { describe, expect, it } from 'vitest'
import { siguienteAccion, textoVence, type Situacion } from './siguiente'

const U = 10_000_000n
const AHORA = 1_793_718_000

const base: Situacion = {
  estado: 'Activa',
  yo: 'GYO',
  n: 5,
  unidos: 5,
  cuota: 20n * U,
  multa: 1n * U,
  turno: 1,
  pagaron: 2,
  mio: { posicion: 3, cobro: false, moroso: false, deuda: 0n },
  yaPague: false,
  cobra: 'Ana',
  soyQuienCobra: false,
  cobraGuardado: false,
  entregable: false,
  vence: AHORA + 90,
  ahora: AHORA,
}

describe('textoVence', () => {
  it('cuenta regresiva si falta menos de una hora; si no, la fecha', () => {
    expect(textoVence(AHORA + 90, AHORA)).toBe('Vence en 1 min 30 s.')
    expect(textoVence(AHORA + 3 * 86_400, AHORA)).toMatch(/^Vence el \S+ \d+ de \S+\.$/)
    expect(textoVence(AHORA - 60, AHORA)).toBe('El plazo venció hace 1 min.')
  })
})

describe('siguienteAccion', () => {
  it('te toca pagar', () => {
    expect(siguienteAccion(base)).toEqual({ tono: 'pagar', titulo: 'Te toca pagar $20', detalle: 'Vence en 1 min 30 s.' })
  })

  it('vas tarde: avisa la multa y que el depósito cubre', () => {
    const s = siguienteAccion({ ...base, vence: AHORA - 10 })
    expect(s.tono).toBe('tarde')
    expect(s.titulo).toBe('Vas tarde: paga tu cuota de $20')
    expect(s.detalle).toContain('cuesta $1 de multa')
  })

  it('ya pagaste: esperando a los demás', () => {
    const s = siguienteAccion({ ...base, yaPague: true, pagaron: 3 })
    expect(s).toMatchObject({ tono: 'esperar', titulo: 'Ya pagaste. Esperando a 2 personas' })
    expect(s.detalle).toContain('En este turno cobra Ana.')
  })

  it('te toca cobrar cuando el pozo se puede entregar', () => {
    const s = siguienteAccion({ ...base, yaPague: true, pagaron: 5, soyQuienCobra: true, entregable: true })
    expect(s).toMatchObject({ tono: 'cobrar', titulo: 'Te toca cobrar $100' })
  })

  it('el turno terminó: falta pagarle a Ana', () => {
    const s = siguienteAccion({ ...base, yaPague: true, entregable: true, vence: AHORA - 5 })
    expect(s).toMatchObject({ tono: 'entregar', titulo: 'El turno terminó: falta entregarle el pozo a Ana' })
  })

  it('debes: pagar lo que falta', () => {
    const s = siguienteAccion({ ...base, mio: { ...base.mio!, moroso: true, deuda: 100n * U } })
    expect(s).toMatchObject({ tono: 'deuda', titulo: 'Debes $100' })
  })

  it('tanda abierta: invitado o esperando a que se complete', () => {
    expect(siguienteAccion({ ...base, estado: 'Abierta', unidos: 3, mio: null }).tono).toBe('entrar')
    expect(siguienteAccion({ ...base, estado: 'Abierta', unidos: 3 })).toMatchObject({ tono: 'invitar', titulo: 'Esperando a 2 personas más' })
    expect(siguienteAccion({ ...base, estado: 'Abierta', unidos: 4 }).titulo).toBe('Esperando a 1 persona más')
  })

  it('sin cuenta, al final y por repartir', () => {
    expect(siguienteAccion({ ...base, yo: null, mio: null }).detalle).toBe('Entra para ver qué te toca.')
    expect(siguienteAccion({ ...base, estado: 'PorLiquidar' }).tono).toBe('repartir')
    expect(siguienteAccion({ ...base, estado: 'Finalizada' }).titulo).toBe('Terminó la tanda')
  })
})
