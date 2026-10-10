import { describe, expect, it } from 'vitest'
import type { ContractEvent } from 'tanda'
import type { EventoTanda } from './historia'
import {
  abrirLeidas,
  claveLeidas,
  contarSinLeer,
  estaLeida,
  guardarLeidas,
  haceCuanto,
  marcarLeidas,
  MAX_LEIDAS,
  notificacionesDeAccion,
  notificacionesDeEventos,
  notificacionesDeInvitacion,
  notificacionesDePendientes,
  ordenarNotificaciones,
  type Contexto,
  type Notificacion,
  type TandaParaAvisos,
} from './notificaciones'

const U = 10_000_000n
const AHORA = 1_793_718_000
const NOMBRES: Record<string, string> = { GYO: 'Yo', GANA: 'Ana', GBETO: 'Beto', GCARLA: 'Carla' }
const c: Contexto = { yo: 'GYO', ahora: AHORA, nombre: (d) => NOMBRES[d] ?? d, tanda: (id) => `Tanda ${id}` }

type Estado = TandaParaAvisos['tanda']['estado']['tag']
const miembro = (direccion: string, posicion: number, o: Partial<TandaParaAvisos['miembros'][number]> = {}) => ({
  direccion,
  posicion,
  cobro: false,
  moroso: false,
  deuda: 0n,
  ...o,
})

/** Una tanda de 3 personas, $20 por semana, en el turno 2 (ronda_actual 1): cobra Beto. Yo soy el turno 3. */
function tanda(o: { estado?: Estado; creador?: string; miembros?: TandaParaAvisos['miembros']; pagaron?: string[]; vence?: number; modo?: string; ronda?: number } = {}): TandaParaAvisos {
  return {
    id: 5,
    tanda: {
      estado: { tag: o.estado ?? 'Activa', values: undefined } as TandaParaAvisos['tanda']['estado'],
      creador: o.creador ?? 'GANA',
      cuota: 20n * U,
      n_miembros: 3,
      penalidad_bps: 1000,
      periodo_seg: 604_800n,
      inicio_ronda: BigInt(AHORA - 3_600),
      ronda_actual: o.ronda ?? 1,
    },
    miembros: o.miembros ?? [miembro('GANA', 0, { cobro: true }), miembro('GBETO', 1), miembro('GYO', 2)],
    pagaron: o.pagaron ?? [],
    vence: o.vence ?? AHORA + 3 * 86_400,
    modo: o.modo ?? 'Llegada',
  }
}

let n = 0
const ev = (evento: ContractEvent, cerradoEn = '2026-10-10T12:00:00Z'): EventoTanda => ({
  id: String(++n).padStart(6, '0'),
  ledger: 100 + n,
  cerradoEn,
  evento,
})

describe('notificacionesDeAccion: lo que te toca hacer', () => {
  it('te toca pagar: con lo que cuesta, en qué tanda y cuándo vence', () => {
    const [a, ...otras] = notificacionesDeAccion(tanda(), c)
    expect(otras).toEqual([])
    expect(a).toMatchObject({
      id: 'pagar:5:1',
      tipo: 'pagar',
      titulo: 'Te toca pagar $20 en Tanda 5',
      href: '#/tanda/5',
      cuando: AHORA,
      accion: true,
    })
    expect(a.detalle).toMatch(/^Vence el \S+ \d+ de \S+\.$/)
  })

  it('cada turno es un aviso nuevo (el id lleva el turno)', () => {
    expect(notificacionesDeAccion(tanda({ ronda: 1 }), c)[0].id).toBe('pagar:5:1')
    expect(notificacionesDeAccion(tanda({ ronda: 2 }), c)[0].id).toBe('pagar:5:2')
  })

  it('vas tarde: otro aviso, con la multa y lo que pasa si no pagas', () => {
    const [a] = notificacionesDeAccion(tanda({ vence: AHORA - 7_200 }), c)
    expect(a).toMatchObject({ id: 'tarde:5:1', tipo: 'tarde', titulo: 'Vas tarde: paga tu cuota de $20 en Tanda 5' })
    expect(a.detalle).toMatch(/El plazo venció hace 2 h\./)
    expect(a.detalle).toMatch(/\$2 de multa/)
  })

  it('si ya pagaste, no hay aviso', () => {
    expect(notificacionesDeAccion(tanda({ pagaron: ['GYO'] }), c)).toEqual([])
  })

  it('te toca cobrar cuando el turno es tuyo, ya pagaste y el plazo venció', () => {
    const t = tanda({ ronda: 2, vence: AHORA - 60, pagaron: ['GYO', 'GANA'] })
    const [a] = notificacionesDeAccion(t, c)
    expect(a).toMatchObject({ id: 'cobrar:5:2', tipo: 'cobrar', titulo: 'Te toca cobrar $60 en Tanda 5', detalle: 'Tu pozo está listo.' })
  })

  it('te toca cobrar también si todos pagaron antes de que venza (cierre anticipado)', () => {
    const t = tanda({ ronda: 2, pagaron: ['GYO', 'GANA', 'GBETO'] })
    expect(notificacionesDeAccion(t, c)[0]).toMatchObject({ tipo: 'cobrar', titulo: 'Te toca cobrar $60 en Tanda 5' })
  })

  it('en una subasta no se cobra antes de que venza', () => {
    const t = tanda({ ronda: 2, pagaron: ['GYO', 'GANA', 'GBETO'], modo: 'Subasta' })
    expect(notificacionesDeAccion(t, c)).toEqual([])
  })

  it('si tienes un pago pendiente en la tanda: "Debes", con un id que no cambia con el turno', () => {
    const t = tanda({ miembros: [miembro('GANA', 0), miembro('GBETO', 1), miembro('GYO', 2, { moroso: true, deuda: 50n * U })] })
    const [a] = notificacionesDeAccion(t, c)
    expect(a).toMatchObject({ id: 'deuda:5', tipo: 'deuda', titulo: 'Debes $50 en Tanda 5' })
    expect(a.detalle).toMatch(/Paga lo que falta/)
  })

  it('no hay aviso si no estás en la tanda o si la tanda no está en curso', () => {
    expect(notificacionesDeAccion(tanda({ miembros: [miembro('GANA', 0), miembro('GBETO', 1)] }), c)).toEqual([])
    for (const estado of ['Abierta', 'PorLiquidar', 'Finalizada', 'Cancelada'] as const) {
      expect(notificacionesDeAccion(tanda({ estado }), c)).toEqual([])
    }
  })

  it('no usa jerga del glosario', () => {
    const textos = [
      ...notificacionesDeAccion(tanda(), c),
      ...notificacionesDeAccion(tanda({ vence: AHORA - 7_200 }), c),
      ...notificacionesDeAccion(tanda({ ronda: 2, vence: AHORA - 60, pagaron: ['GYO'] }), c),
      ...notificacionesDeAccion(tanda({ miembros: [miembro('GYO', 2, { moroso: true, deuda: 50n * U })] }), c),
    ].map((x) => `${x.titulo} ${x.detalle ?? ''}`)
    expect(textos.join(' ')).not.toMatch(/mora|moroso|garantía|colateral|bolsa|ronda|TUSD/i)
  })
})

describe('notificacionesDePendientes: alguien con un pago pendiente se unió', () => {
  const abierta = (creador: string) =>
    tanda({ estado: 'Abierta', creador, miembros: [miembro('GBETO', 0), miembro('GCARLA', 1)] })

  it('en tu tanda: "se unió a tu tanda", con lo que puede pasar', () => {
    const [a, ...otras] = notificacionesDePendientes(abierta('GYO'), new Set(['GBETO']), c)
    expect(otras).toEqual([])
    expect(a).toMatchObject({
      id: 'pendiente:5:GBETO',
      tipo: 'pendiente',
      titulo: 'Beto, que tiene un pago pendiente, se unió a tu tanda',
      detalle: 'Si la tanda empieza y no paga, su depósito podría no alcanzar.',
      accion: true,
    })
  })

  it('en una tanda donde solo estás: dice cuál', () => {
    const t = tanda({ estado: 'Abierta', creador: 'GANA', miembros: [miembro('GYO', 0), miembro('GBETO', 1)] })
    expect(notificacionesDePendientes(t, new Set(['GBETO']), c)[0].titulo).toBe('Beto, que tiene un pago pendiente, se unió a Tanda 5')
  })

  it('un aviso por persona con pago pendiente, y ninguno por quien está al día ni por ti', () => {
    const t = tanda({ estado: 'Abierta', creador: 'GYO', miembros: [miembro('GYO', 0), miembro('GBETO', 1), miembro('GCARLA', 2)] })
    const avisos = notificacionesDePendientes(t, new Set(['GYO', 'GBETO', 'GCARLA']), c)
    expect(avisos.map((a) => a.id)).toEqual(['pendiente:5:GBETO', 'pendiente:5:GCARLA'])
    expect(notificacionesDePendientes(t, new Set(), c)).toEqual([])
  })

  it('solo antes de que la tanda empiece y solo si la tanda es tuya', () => {
    expect(notificacionesDePendientes({ ...abierta('GYO'), tanda: { ...abierta('GYO').tanda, estado: { tag: 'Activa', values: undefined } } }, new Set(['GBETO']), c)).toEqual([])
    expect(notificacionesDePendientes(abierta('GANA'), new Set(['GBETO']), c)).toEqual([])
  })
})

describe('notificacionesDeInvitacion: te invitaron y todavía no te unes', () => {
  const abierta = tanda({ estado: 'Abierta', creador: 'GANA', miembros: [miembro('GANA', 0)] })
  const porId = (t: TandaParaAvisos) => new Map([[t.id, t]])

  it('avisa con la tanda en una línea y desde cuándo', () => {
    const [a] = notificacionesDeInvitacion([{ id: 5, desde: AHORA - 600 }], porId(abierta), c)
    expect(a).toMatchObject({
      id: 'invitacion:5',
      tipo: 'invitacion',
      titulo: 'Te invitaron a Tanda 5',
      detalle: '3 personas · $20 por semana. Entra para unirte.',
      href: '#/tanda/5',
      cuando: AHORA - 600,
      accion: true,
    })
  })

  it('no avisa si ya estás, si la creaste, si se llenó, si ya empezó o si no se leyó', () => {
    const inv = [{ id: 5, desde: AHORA }]
    expect(notificacionesDeInvitacion(inv, porId(tanda({ estado: 'Abierta', creador: 'GANA', miembros: [miembro('GANA', 0), miembro('GYO', 1)] })), c)).toEqual([])
    expect(notificacionesDeInvitacion(inv, porId(tanda({ estado: 'Abierta', creador: 'GYO', miembros: [miembro('GANA', 0)] })), c)).toEqual([])
    expect(notificacionesDeInvitacion(inv, porId(tanda({ estado: 'Abierta', creador: 'GANA', miembros: [miembro('GANA', 0), miembro('GBETO', 1), miembro('GCARLA', 2)] })), c)).toEqual([])
    expect(notificacionesDeInvitacion(inv, porId(tanda({ estado: 'Activa' })), c)).toEqual([])
    expect(notificacionesDeInvitacion(inv, new Map(), c)).toEqual([])
  })
})

describe('notificacionesDeEventos: lo que pasó', () => {
  it('la tanda empezó', () => {
    const [a] = notificacionesDeEventos(5, [ev({ name: 'EvIniciada', data: { id: 5, inicio_ronda: 1n } })], c)
    expect(a).toMatchObject({
      id: 'empezo:5',
      tipo: 'empezo',
      titulo: 'La tanda empezó',
      detalle: 'Tanda 5: ya está en marcha el turno 1.',
      href: '#/tanda/5',
      accion: false,
      cuando: Date.parse('2026-10-10T12:00:00Z') / 1000,
    })
  })

  it('la tanda terminó: dice cuánto recibiste, si se sabe', () => {
    const final = ev({ name: 'EvFinalizada', data: { id: 5, rendimiento: 0n, fondo_premios: 0n, retenido: 0n, sin_repartir: 0n } })
    const conMonto = notificacionesDeEventos(5, [ev({ name: 'EvLiquidado', data: { id: 5, miembro: 'GYO', monto: 945n * U / 10n } }), final], c)
    expect(conMonto.find((x) => x.tipo === 'termino')).toMatchObject({
      id: 'termino:5',
      titulo: 'La tanda terminó',
      detalle: 'Tanda 5: recibiste $94,50 al final. Mira el detalle.',
    })
    const sinMonto = notificacionesDeEventos(5, [ev({ name: 'EvLiquidado', data: { id: 5, miembro: 'GANA', monto: 100n * U } }), final], c)
    expect(sinMonto.find((x) => x.tipo === 'termino')?.detalle).toBe('Tanda 5: mira cuánto recibiste.')
  })

  it('alguien te pagó una deuda (y no cuando se la pagó a otra persona)', () => {
    const mio = ev({ name: 'EvAbono', data: { id: 5, deudor: 'GANA', acreedor: 'GYO', ronda: 1, monto: 40n * U, retenida: false } })
    const deOtro = ev({ name: 'EvAbono', data: { id: 5, deudor: 'GANA', acreedor: 'GBETO', ronda: 1, monto: 40n * U, retenida: false } })
    const avisos = notificacionesDeEventos(5, [mio, deOtro], c)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({ id: `abono:${mio.id}`, tipo: 'abono', titulo: 'Ana te pagó $40 de lo que te debía', detalle: 'Tanda 5.', accion: false })
  })

  it('si tu pozo estaba guardado, el abono se suma a él', () => {
    const [a] = notificacionesDeEventos(5, [ev({ name: 'EvAbono', data: { id: 5, deudor: 'GANA', acreedor: 'GYO', ronda: 1, monto: 40n * U, retenida: true } })], c)
    expect(a.titulo).toBe('Ana pagó $40 de lo que debía: se sumaron a tu pozo guardado')
  })

  it('después de terminar: te pagaron, o recibiste tu parte de lo que alguien debía', () => {
    const pago = ev({ name: 'EvAbonoFinal', data: { id: 5, deudor: 'GCARLA', hacia: 'GYO', monto: 20n * U, reparto: false } })
    const reparto = ev({ name: 'EvAbonoFinal', data: { id: 5, deudor: 'GCARLA', hacia: 'GYO', monto: 20n * U, reparto: true } })
    const ajeno = ev({ name: 'EvAbonoFinal', data: { id: 5, deudor: 'GCARLA', hacia: 'GANA', monto: 20n * U, reparto: false } })
    const avisos = notificacionesDeEventos(5, [pago, reparto, ajeno], c)
    expect(avisos.map((a) => a.titulo)).toEqual(['Carla te pagó $20 de lo que te debía', 'Recibiste $20 de lo que debía Carla'])
    expect(avisos[0].detalle).toBe('Tanda 5, ya terminada.')
  })

  it('ignora los demás eventos y usa el momento de la lectura si la fecha no sirve', () => {
    const otros = [
      ev({ name: 'EvPago', data: { id: 5, miembro: 'GYO', ronda: 0, tarde: false } }),
      ev({ name: 'EvIniciada', data: { id: 5, inicio_ronda: 1n } }, 'no es una fecha'),
    ]
    const avisos = notificacionesDeEventos(5, otros, c)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].cuando).toBe(AHORA)
  })
})

describe('ordenarNotificaciones', () => {
  const base = { detalle: undefined, href: '#/tanda/1' }
  const aviso = (id: string, tipo: Notificacion['tipo'], accion: boolean, cuando: number): Notificacion => ({ ...base, id, tipo, titulo: id, accion, cuando })

  it('lo que te toca hacer va primero (lo más urgente arriba) y después lo que pasó, lo más nuevo primero', () => {
    const lista = [
      aviso('termino:1', 'termino', false, 100),
      aviso('pagar:1:0', 'pagar', true, 300),
      aviso('abono:x', 'abono', false, 200),
      aviso('invitacion:2', 'invitacion', true, 50),
      aviso('cobrar:1:0', 'cobrar', true, 300),
    ]
    expect(ordenarNotificaciones(lista).map((a) => a.id)).toEqual(['cobrar:1:0', 'pagar:1:0', 'invitacion:2', 'abono:x', 'termino:1'])
  })

  it('no repite un aviso que llega por dos caminos', () => {
    const lista = [aviso('empezo:1', 'empezo', false, 1), aviso('empezo:1', 'empezo', false, 1)]
    expect(ordenarNotificaciones(lista)).toHaveLength(1)
  })
})

describe('haceCuanto', () => {
  it('ahora, minutos, horas, ayer y días', () => {
    expect(haceCuanto(AHORA - 10, AHORA)).toBe('ahora')
    expect(haceCuanto(AHORA - 5 * 60 - 20, AHORA)).toBe('hace 5 min')
    expect(haceCuanto(AHORA - 2 * 3_600 - 100, AHORA)).toBe('hace 2 h')
    expect(haceCuanto(AHORA - 30 * 3_600, AHORA)).toBe('ayer')
    expect(haceCuanto(AHORA - 3 * 86_400 - 5, AHORA)).toBe('hace 3 días')
    expect(haceCuanto(AHORA + 500, AHORA)).toBe('ahora')
  })
})

describe('lo ya leído (se guarda en el navegador)', () => {
  /** Un localStorage de mentira. */
  function almacen(inicial: Record<string, string> = {}) {
    const datos = new Map(Object.entries(inicial))
    return {
      datos,
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
    }
  }
  const aviso = (id: string, accion: boolean, cuando: number): Notificacion => ({ id, tipo: accion ? 'pagar' : 'empezo', titulo: id, href: '#/', accion, cuando })

  it('la primera vez empieza en este momento y lo deja guardado', () => {
    const a = almacen()
    expect(abrirLeidas(a, 'GYO', AHORA)).toEqual({ base: AHORA, ids: [] })
    expect(JSON.parse(a.datos.get('rounda:notificaciones:GYO') ?? '')).toEqual({ base: AHORA, ids: [] })
    // Otra vez, más tarde: sigue valiendo el primer momento.
    expect(abrirLeidas(a, 'GYO', AHORA + 999)).toEqual({ base: AHORA, ids: [] })
  })

  it('cada cuenta tiene su lista', () => {
    expect(claveLeidas('GYO')).toBe('rounda:notificaciones:GYO')
    const a = almacen()
    guardarLeidas(a, 'GYO', { base: 1, ids: ['x'] })
    expect(abrirLeidas(a, 'GANA', AHORA)).toEqual({ base: AHORA, ids: [] })
  })

  it('lo que pasó antes de la primera vez cuenta como leído; lo que te toca hacer, no', () => {
    const l = { base: AHORA, ids: [] as string[] }
    expect(estaLeida(aviso('empezo:1', false, AHORA - 100), l)).toBe(true)
    expect(estaLeida(aviso('empezo:2', false, AHORA + 100), l)).toBe(false)
    expect(estaLeida(aviso('pagar:1:0', true, AHORA - 100), l)).toBe(false)
  })

  it('marcar como leído da por leídos todos los de la lista y no pierde los anteriores', () => {
    const lista = [aviso('pagar:1:0', true, AHORA), aviso('empezo:1', false, AHORA + 5)]
    const l = marcarLeidas({ base: AHORA, ids: ['viejo'] }, lista)
    expect(l.ids).toEqual(['viejo', 'pagar:1:0', 'empezo:1'])
    expect(contarSinLeer(lista, l)).toBe(0)
    expect(contarSinLeer(lista, { base: AHORA, ids: [] })).toBe(2)
  })

  it('guarda solo los últimos ids', () => {
    const a = almacen()
    const ids = Array.from({ length: MAX_LEIDAS + 20 }, (_, i) => `id${i}`)
    guardarLeidas(a, 'GYO', { base: 1, ids })
    const guardado = JSON.parse(a.datos.get('rounda:notificaciones:GYO') ?? '') as { ids: string[] }
    expect(guardado.ids).toHaveLength(MAX_LEIDAS)
    expect(guardado.ids.at(-1)).toBe(`id${MAX_LEIDAS + 19}`)
  })

  it('lo guardado que no sirve se ignora, y sin almacenamiento nada se rompe', () => {
    expect(abrirLeidas(almacen({ 'rounda:notificaciones:GYO': '{no es json' }), 'GYO', AHORA)).toEqual({ base: AHORA, ids: [] })
    expect(abrirLeidas(almacen({ 'rounda:notificaciones:GYO': JSON.stringify({ base: 'x', ids: [1] }) }), 'GYO', AHORA)).toEqual({ base: AHORA, ids: [] })
    expect(abrirLeidas(null, 'GYO', AHORA)).toEqual({ base: AHORA, ids: [] })
    expect(() => guardarLeidas(null, 'GYO', { base: 1, ids: [] })).not.toThrow()
    const roto = { getItem: () => null, setItem: () => { throw new Error('lleno') } }
    expect(() => guardarLeidas(roto, 'GYO', { base: 1, ids: [] })).not.toThrow()
    expect(abrirLeidas(roto, 'GYO', AHORA)).toEqual({ base: AHORA, ids: [] })
  })
})
