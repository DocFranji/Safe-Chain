// La campanita (pedido 3 del plan v5): los avisos de la persona, armados solo con lo que se lee de la red.
// Sin servidor nuevo y sin avisos al teléfono: cada vez que se lee, se calcula la lista completa.
// Hay dos clases de avisos:
//  - los de "lo que te toca hacer ahora" (te toca pagar, te toca cobrar, debes, alguien con un pago pendiente se
//    unió a tu tanda, te invitaron): salen del estado de las tandas y duran mientras sigan siendo ciertos;
//  - los de "lo que pasó" (la tanda empezó, terminó, alguien te pagó una deuda): salen de los eventos de la red,
//    que la red guarda unos días.
// Lógica pura, sin React ni red: la prueba es notificaciones.test.ts. Lo que ya se leyó se guarda en el navegador
// (rounda:notificaciones:<cuenta>). Las palabras siguen el glosario.
import type { Tanda } from 'tanda'
import type { Almacen } from './almacen'
import { puedeCerrarAntes } from './cobro'
import { duracion } from './formato'
import { dinero } from './glosario'
import type { EventoTanda } from './historia'
import { lineaTanda } from './resumen'
import { rutaTanda } from './rutas'
import { siguienteAccion } from './siguiente'
import type { Invitacion } from './invitaciones'

export type TipoNotificacion =
  | 'cobrar'
  | 'tarde'
  | 'pagar'
  | 'deuda'
  | 'pendiente'
  | 'invitacion'
  | 'abono'
  | 'empezo'
  | 'termino'

export type Notificacion = {
  /** Estable entre lecturas: sirve para saber si ya se leyó. */
  id: string
  tipo: TipoNotificacion
  titulo: string
  detalle?: string
  /** A dónde lleva (una ruta de la app). */
  href: string
  /** Cuándo pasó (segundos Unix). Los de "ahora" llevan el momento de la lectura. */
  cuando: number
  /** true: es lo que te toca hacer ahora. false: es algo que pasó. */
  accion: boolean
}

/** Lo que se lee de una tanda para armar los avisos (el estado y la ronda, sin la bóveda ni las deudas). */
export type TandaParaAvisos = {
  id: number
  tanda: Pick<
    Tanda,
    'estado' | 'creador' | 'cuota' | 'n_miembros' | 'penalidad_bps' | 'periodo_seg' | 'inicio_ronda' | 'ronda_actual'
  >
  miembros: { direccion: string; posicion: number; cobro: boolean; moroso: boolean; deuda: bigint }[]
  /** Quiénes ya pagaron el turno en curso. */
  pagaron: string[]
  /** Cuándo vence el turno en curso (segundos Unix). */
  vence: number
  /** Modo de turnos ('Llegada', 'Subasta'...). */
  modo: string
}

export type Contexto = {
  /** La persona que mira. */
  yo: string
  /** Segundos Unix. */
  ahora: number
  nombre: (direccion: string) => string
  /** Cómo se llama la tanda en pantalla: "Tanda 5" (y, cuando las tandas tengan nombre, ese nombre). */
  tanda: (id: number) => string
}

const esMia = (t: TandaParaAvisos, yo: string) => t.tanda.creador === yo || t.miembros.some((m) => m.direccion === yo)

// ---------------------------------------------------------------------------
// Lo que te toca hacer ahora
// ---------------------------------------------------------------------------

/**
 * Te toca pagar, vas tarde, te toca cobrar o debes: lo mismo que dice "la siguiente acción" de la página de la tanda
 * (siguienteAccion), para que las dos pantallas nunca se contradigan.
 */
export function notificacionesDeAccion(t: TandaParaAvisos, c: Contexto): Notificacion[] {
  const mio = t.miembros.find((m) => m.direccion === c.yo)
  if (!mio || t.tanda.estado.tag !== 'Activa') return []
  const beneficiario = t.miembros.find((m) => m.posicion === t.tanda.ronda_actual)
  const vencida = t.vence <= c.ahora
  const antes = puedeCerrarAntes(t.tanda, t.pagaron.length, t.modo, c.ahora)
  const s = siguienteAccion({
    estado: t.tanda.estado.tag,
    yo: c.yo,
    n: t.tanda.n_miembros,
    unidos: t.miembros.length,
    cuota: t.tanda.cuota,
    multa: (t.tanda.cuota * BigInt(t.tanda.penalidad_bps)) / 10_000n,
    turno: t.tanda.ronda_actual,
    pagaron: t.pagaron.length,
    mio,
    yaPague: t.pagaron.includes(c.yo),
    cobra: beneficiario ? c.nombre(beneficiario.direccion) : null,
    soyQuienCobra: beneficiario !== undefined && beneficiario.direccion === c.yo,
    cobraGuardado: beneficiario?.moroso === true,
    entregable: vencida || antes,
    vence: t.vence,
    ahora: c.ahora,
  })
  if (s.tono !== 'pagar' && s.tono !== 'tarde' && s.tono !== 'cobrar' && s.tono !== 'deuda') return []
  // "Debes" no cambia con cada turno; lo demás sí: cada turno es un aviso nuevo.
  const id = s.tono === 'deuda' ? `deuda:${t.id}` : `${s.tono}:${t.id}:${t.tanda.ronda_actual}`
  return [
    { id, tipo: s.tono, titulo: `${s.titulo} en ${c.tanda(t.id)}`, detalle: s.detalle, href: rutaTanda(t.id), cuando: c.ahora, accion: true },
  ]
}

/**
 * "Beto, que tiene un pago pendiente, se unió a tu tanda" (pedido 4): mientras la tanda no empieza, avisa de cada
 * persona del grupo que tiene un pago pendiente en otra tanda. `conPendiente`: quiénes lo tienen.
 */
export function notificacionesDePendientes(t: TandaParaAvisos, conPendiente: ReadonlySet<string>, c: Contexto): Notificacion[] {
  if (t.tanda.estado.tag !== 'Abierta' || !esMia(t, c.yo)) return []
  const dondeSeUnio = t.tanda.creador === c.yo ? 'tu tanda' : c.tanda(t.id)
  return t.miembros
    .filter((m) => m.direccion !== c.yo && conPendiente.has(m.direccion))
    .map((m) => ({
      id: `pendiente:${t.id}:${m.direccion}`,
      tipo: 'pendiente' as const,
      titulo: `${c.nombre(m.direccion)}, que tiene un pago pendiente, se unió a ${dondeSeUnio}`,
      detalle: 'Si la tanda empieza y no paga, su depósito podría no alcanzar.',
      href: rutaTanda(t.id),
      cuando: c.ahora,
      accion: true,
    }))
}

/**
 * "Te invitaron a Tanda 5": quien abrió un enlace de invitación y todavía no se unió. Solo mientras la tanda siga
 * abierta, con lugares libres y sin que la persona esté en ella. `porId`: lo que se leyó de cada tanda.
 */
export function notificacionesDeInvitacion(invitaciones: Invitacion[], porId: ReadonlyMap<number, TandaParaAvisos>, c: Contexto): Notificacion[] {
  const salida: Notificacion[] = []
  for (const inv of invitaciones) {
    const t = porId.get(inv.id)
    if (!t || t.tanda.estado.tag !== 'Abierta' || esMia(t, c.yo)) continue
    if (t.miembros.length >= t.tanda.n_miembros) continue
    const linea = lineaTanda({ cuota: t.tanda.cuota, n: t.tanda.n_miembros, periodoSeg: Number(t.tanda.periodo_seg) })
    salida.push({
      id: `invitacion:${t.id}`,
      tipo: 'invitacion',
      titulo: `Te invitaron a ${c.tanda(t.id)}`,
      detalle: `${linea}. Entra para unirte.`,
      href: rutaTanda(t.id),
      cuando: inv.desde,
      accion: true,
    })
  }
  return salida
}

// ---------------------------------------------------------------------------
// Lo que pasó (eventos de la red)
// ---------------------------------------------------------------------------

function segundos(iso: string, respaldo: number): number {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : respaldo
}

/**
 * La tanda empezó, la tanda terminó y alguien te pagó una deuda. Solo de las tandas de la persona. La red guarda los
 * eventos unos días: un aviso viejo simplemente deja de salir.
 */
export function notificacionesDeEventos(id: number, eventos: EventoTanda[], c: Contexto): Notificacion[] {
  const salida: Notificacion[] = []
  const href = rutaTanda(id)
  const dondeFue = c.tanda(id)
  for (const e of eventos) {
    const ev = e.evento
    const cuando = segundos(e.cerradoEn, c.ahora)
    switch (ev.name) {
      case 'EvIniciada':
        salida.push({
          id: `empezo:${id}`,
          tipo: 'empezo',
          titulo: 'La tanda empezó',
          detalle: `${dondeFue}: ya está en marcha el turno 1.`,
          href,
          cuando,
          accion: false,
        })
        break
      case 'EvFinalizada': {
        const mio = eventos.find((x) => x.evento.name === 'EvLiquidado' && x.evento.data.miembro === c.yo)
        const recibido = mio?.evento.name === 'EvLiquidado' ? mio.evento.data.monto : undefined
        salida.push({
          id: `termino:${id}`,
          tipo: 'termino',
          titulo: 'La tanda terminó',
          detalle:
            recibido !== undefined && recibido > 0n
              ? `${dondeFue}: recibiste ${dinero(recibido)} al final. Mira el detalle.`
              : `${dondeFue}: mira cuánto recibiste.`,
          href,
          cuando,
          accion: false,
        })
        break
      }
      case 'EvAbono':
        if (ev.data.acreedor !== c.yo || ev.data.monto === undefined || ev.data.deudor === undefined) break
        salida.push({
          id: `abono:${e.id}`,
          tipo: 'abono',
          titulo: ev.data.retenida
            ? `${c.nombre(ev.data.deudor)} pagó ${dinero(ev.data.monto)} de lo que debía: se sumaron a tu pozo guardado`
            : `${c.nombre(ev.data.deudor)} te pagó ${dinero(ev.data.monto)} de lo que te debía`,
          detalle: `${dondeFue}.`,
          href,
          cuando,
          accion: false,
        })
        break
      case 'EvAbonoFinal':
        if (ev.data.hacia !== c.yo || ev.data.monto === undefined || ev.data.deudor === undefined) break
        salida.push({
          id: `abono:${e.id}`,
          tipo: 'abono',
          titulo: ev.data.reparto
            ? `Recibiste ${dinero(ev.data.monto)} de lo que debía ${c.nombre(ev.data.deudor)}`
            : `${c.nombre(ev.data.deudor)} te pagó ${dinero(ev.data.monto)} de lo que te debía`,
          detalle: `${dondeFue}, ya terminada.`,
          href,
          cuando,
          accion: false,
        })
        break
    }
  }
  return salida
}

// ---------------------------------------------------------------------------
// Orden y tiempos
// ---------------------------------------------------------------------------

/** Lo que te toca hacer va primero (lo que más urge, arriba); después lo que pasó, lo más nuevo primero. */
const URGENCIA: Record<TipoNotificacion, number> = {
  cobrar: 0,
  tarde: 1,
  pagar: 2,
  deuda: 3,
  pendiente: 4,
  invitacion: 5,
  abono: 6,
  empezo: 7,
  termino: 8,
}

/** Une los avisos de varias fuentes, sin repetir ninguno (por id) y en el orden en que se muestran. */
export function ordenarNotificaciones(lista: Notificacion[]): Notificacion[] {
  const porId = new Map<string, Notificacion>()
  for (const n of lista) if (!porId.has(n.id)) porId.set(n.id, n)
  return [...porId.values()].sort((a, b) => {
    if (a.accion !== b.accion) return a.accion ? -1 : 1
    if (a.accion) return URGENCIA[a.tipo] - URGENCIA[b.tipo] || (a.id < b.id ? -1 : 1)
    return b.cuando - a.cuando || (a.id < b.id ? -1 : 1)
  })
}

/** "ahora" · "hace 5 min" · "hace 2 h" · "ayer" · "hace 3 días". */
export function haceCuanto(cuando: number, ahora: number): string {
  const falta = Math.max(0, ahora - cuando)
  if (falta < 60) return 'ahora'
  if (falta < 3_600) return `hace ${duracion(Math.floor(falta / 60) * 60)}`
  if (falta < 86_400) return `hace ${Math.floor(falta / 3_600)} h`
  if (falta < 2 * 86_400) return 'ayer'
  return `hace ${Math.floor(falta / 86_400)} días`
}

// ---------------------------------------------------------------------------
// Lo que ya se leyó (se guarda en el navegador, una lista por cuenta)
// ---------------------------------------------------------------------------

/**
 * `base`: el momento en que esta cuenta usó la campanita por primera vez en este navegador. Lo que pasó antes (los
 * eventos que la red todavía guarda) cuenta como leído: al entrar en otro teléfono no aparece una montaña de avisos
 * viejos sin leer. Lo que te toca hacer ahora nunca se da por leído así.
 */
export type Leidas = { base: number; ids: string[] }

/** Cuántos ids se guardan como máximo por cuenta (los más recientes). */
export const MAX_LEIDAS = 300

export const claveLeidas = (cuenta: string) => `rounda:notificaciones:${cuenta}`

function esLeidas(x: unknown): x is Leidas {
  if (typeof x !== 'object' || x === null) return false
  const { base, ids } = x as Record<string, unknown>
  return typeof base === 'number' && Number.isFinite(base) && Array.isArray(ids) && ids.every((i) => typeof i === 'string')
}

export function guardarLeidas(almacen: Almacen | null, cuenta: string, leidas: Leidas): void {
  try {
    almacen?.setItem(claveLeidas(cuenta), JSON.stringify({ base: leidas.base, ids: leidas.ids.slice(-MAX_LEIDAS) }))
  } catch {
    // Sin almacenamiento (modo privado): lo leído dura mientras la página siga abierta.
  }
}

/** Lo leído de esta cuenta. La primera vez (o si lo guardado no sirve) empieza en `ahora` y lo deja guardado. */
export function abrirLeidas(almacen: Almacen | null, cuenta: string, ahora: number): Leidas {
  try {
    const crudo = almacen?.getItem(claveLeidas(cuenta))
    if (crudo) {
      const dato: unknown = JSON.parse(crudo)
      if (esLeidas(dato)) return dato
    }
  } catch {
    // Lo guardado no se puede leer: se empieza de nuevo.
  }
  const nuevas: Leidas = { base: ahora, ids: [] }
  guardarLeidas(almacen, cuenta, nuevas)
  return nuevas
}

export function estaLeida(n: Notificacion, leidas: Leidas): boolean {
  return leidas.ids.includes(n.id) || (!n.accion && n.cuando < leidas.base)
}

export function marcarLeidas(leidas: Leidas, lista: Notificacion[]): Leidas {
  return { base: leidas.base, ids: [...new Set([...leidas.ids, ...lista.map((n) => n.id)])] }
}

export function contarSinLeer(lista: Notificacion[], leidas: Leidas): number {
  return lista.filter((n) => !estaLeida(n, leidas)).length
}
