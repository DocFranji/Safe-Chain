// Buscar y filtrar la lista de tandas (pedido 5 del plan v5). Lógica pura (sin React ni red): la prueba es
// filtros.test.ts. Los filtros van en la URL (#/tandas?cuota=10-50…) para compartirlos y se recuerdan en el navegador.
import { esTerminal, type ResumenTanda } from './lectura'
import { NOMBRES_NIVEL, tieneMoraPendiente, type Historial, type NombreNivel } from './historial'
import { MODOS, type Modo } from './turnos'

export type EstadoFiltro = 'mias' | 'abiertas' | 'en-curso' | 'terminadas' | 'todas'
export type Duracion = 'dias' | 'semanas' | 'meses'

export type Filtros = {
  /** Texto libre: nombre, número, apodo o dirección de quien creó la tanda o de quien está en ella. */
  q: string
  /** null = automático: "Mis tandas" con sesión, "Todas" sin sesión. */
  estado: EstadoFiltro | null
  /** Cómo se reparten los turnos. */
  tipo: Modo | null
  /** Cuota en dólares; null = sin límite. */
  cuotaMin: number | null
  cuotaMax: number | null
  /** Cuánto dura la tanda completa (todos los turnos). */
  duracion: Duracion | null
  /** Reputación mínima de quien creó la tanda. null = cualquiera. */
  nivel: Exclude<NombreNivel, 'Nuevo'> | null
  /** Esconder las tandas con alguien que tiene un pago pendiente. */
  sinPendientes: boolean
  /** Las canceladas no se muestran si no se piden. */
  canceladas: boolean
}

export const SIN_FILTROS: Filtros = {
  q: '',
  estado: null,
  tipo: null,
  cuotaMin: null,
  cuotaMax: null,
  duracion: null,
  nivel: null,
  sinPendientes: false,
  canceladas: false,
}

export const ESTADOS: { id: EstadoFiltro; texto: string }[] = [
  { id: 'mias', texto: 'Mis tandas' },
  { id: 'abiertas', texto: 'Abiertas' },
  { id: 'en-curso', texto: 'En curso' },
  { id: 'terminadas', texto: 'Terminadas' },
  { id: 'todas', texto: 'Todas' },
]

const DIA = 86_400

export const DURACIONES: { id: Duracion; texto: string }[] = [
  { id: 'dias', texto: 'Menos de una semana' },
  { id: 'semanas', texto: 'De una semana a dos meses' },
  { id: 'meses', texto: 'Dos meses o más' },
]

/** Lo que tarda la tanda de principio a fin: un turno por persona. */
export function duracionTotal(r: Pick<ResumenTanda, 'tanda'>): number {
  return r.tanda.n_miembros * Number(r.tanda.periodo_seg)
}

export function duracionDe(r: Pick<ResumenTanda, 'tanda'>): Duracion {
  const total = duracionTotal(r)
  if (total < 7 * DIA) return 'dias'
  if (total < 60 * DIA) return 'semanas'
  return 'meses'
}

/** Lo que no viene en la tanda y la lista sabe por otro lado. */
export type Contexto = {
  yo: string | null
  /** El apodo o el nombre de la demo de una dirección; null si solo se conoce la dirección. */
  nombreDe: (dir: string) => string | null
  /** Reputación de una dirección; undefined si todavía no se leyó (o no hay historial). */
  nivelDe: (dir: string) => NombreNivel | undefined
  /** Cuántas personas de la tanda tienen un pago pendiente (en esta tanda o en otra). */
  pendientesDe: (r: ResumenTanda) => number
}

/**
 * A quién hay que leerle la reputación: a quienes están en tandas que no terminaron (para la marca de pagos
 * pendientes) y, si se filtra por reputación, a quien creó cada tanda.
 */
export function direccionesARevisar(lista: ResumenTanda[], conCreadores: boolean): string[] {
  const dirs = new Set<string>()
  for (const r of lista) {
    if (!esTerminal(r.tanda.estado.tag)) for (const m of r.miembros) dirs.add(m.direccion)
    if (conCreadores) dirs.add(r.tanda.creador)
  }
  return [...dirs].sort()
}

type Mora = Pick<Historial, 'veces_moroso' | 'deudas_saldadas'>

/**
 * Cuántas personas de la tanda tienen un pago pendiente: en esta tanda (`moroso`) o en otra (lo dice su reputación,
 * como en el contrato). En una tanda terminada o cancelada ya no importa: 0.
 */
export function pendientesEn(r: ResumenTanda, historialDe: (dir: string) => Mora | null | undefined): number {
  if (esTerminal(r.tanda.estado.tag)) return 0
  return r.miembros.filter((m) => {
    if (m.moroso) return true
    const h = historialDe(m.direccion)
    return h ? tieneMoraPendiente(h) : false
  }).length
}

export const estadoEfectivo = (f: Pick<Filtros, 'estado'>, yo: string | null): EstadoFiltro =>
  f.estado ?? (yo ? 'mias' : 'todas')

const participa = (r: ResumenTanda, yo: string | null) =>
  yo !== null && (r.tanda.creador === yo || r.miembros.some((m) => m.direccion === yo))

export function coincideEstado(r: ResumenTanda, f: Pick<Filtros, 'estado' | 'canceladas'>, yo: string | null): boolean {
  const tag = r.tanda.estado.tag
  if (tag === 'Cancelada' && !f.canceladas) return false
  switch (estadoEfectivo(f, yo)) {
    case 'todas':
      return true
    case 'abiertas':
      return tag === 'Abierta'
    case 'en-curso':
      return tag === 'Activa' || tag === 'PorLiquidar'
    case 'terminadas':
      return tag === 'Finalizada' || tag === 'Cancelada'
    case 'mias':
      return participa(r, yo)
  }
}

/** Minúsculas, sin tildes y con un solo espacio: "  Tanda  de la OFICINA " -> "tanda de la oficina". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function coincideTexto(r: ResumenTanda, q: string, ctx: Pick<Contexto, 'nombreDe'>): boolean {
  const buscado = normalizar(q)
  if (!buscado) return true
  // "5", "#5" o "tanda 5": el número de la tanda.
  const numero = buscado.match(/^(?:tanda\s*)?#?(\d+)$/)
  if (numero && r.id === Number(numero[1])) return true
  const personas = [r.tanda.creador, ...r.miembros.map((m) => m.direccion)]
  const textos = [r.nombre ?? '', ...personas.map((d) => ctx.nombreDe(d) ?? '')]
  if (textos.some((t) => normalizar(t).includes(buscado))) return true
  // Un pedazo de una dirección (desde 4 letras, para no confundir un nombre corto con una dirección).
  if (buscado.length >= 4 && /^[a-z2-7]+$/.test(buscado)) {
    return personas.some((d) => d.toLowerCase().includes(buscado))
  }
  return false
}

const UNIDAD = 10_000_000

const NIVEL_ORDEN = (n: NombreNivel) => NOMBRES_NIVEL.indexOf(n)

export function coincide(r: ResumenTanda, f: Filtros, ctx: Contexto): boolean {
  if (!coincideEstado(r, f, ctx.yo)) return false
  if (f.tipo && r.modo !== f.tipo) return false
  const cuota = Number(r.tanda.cuota) / UNIDAD
  if (f.cuotaMin !== null && cuota < f.cuotaMin) return false
  if (f.cuotaMax !== null && cuota > f.cuotaMax) return false
  if (f.duracion && duracionDe(r) !== f.duracion) return false
  if (f.nivel) {
    const nivel = ctx.nivelDe(r.tanda.creador)
    // Si todavía no se sabe, no se muestra: el filtro promete un nivel.
    if (nivel === undefined || NIVEL_ORDEN(nivel) < NIVEL_ORDEN(f.nivel)) return false
  }
  if (f.sinPendientes && ctx.pendientesDe(r) > 0) return false
  return coincideTexto(r, f.q, ctx)
}

export function filtrar(lista: ResumenTanda[], f: Filtros, ctx: Contexto): ResumenTanda[] {
  return lista.filter((r) => coincide(r, f, ctx))
}

/** Cuántos filtros de "Más filtros" están puestos (para el número del botón). */
export function cuantosExtra(f: Filtros): number {
  return [f.tipo, f.cuotaMin ?? f.cuotaMax, f.duracion, f.nivel].filter((x) => x !== null).length + Number(f.sinPendientes) + Number(f.canceladas)
}

/** ¿Hay algo que quitar con "Quitar filtros"? (El estado elegido no cuenta: es la pestaña.) */
export const hayFiltros = (f: Filtros) => cuantosExtra(f) > 0 || f.q.trim() !== ''

// ---------------------------------------------------------------------------
// La URL: #/tandas?q=ana&estado=abiertas&tipo=Subasta&cuota=10-50&duracion=meses&nivel=Plata&sinpendientes=1
// ---------------------------------------------------------------------------

const MAX_Q = 80
const esEstado = (x: string | null): x is EstadoFiltro => ESTADOS.some((e) => e.id === x)
const esModo = (x: string | null): x is Modo => MODOS.some((m) => m.modo === x)
const esDuracion = (x: string | null): x is Duracion => DURACIONES.some((d) => d.id === x)
const esNivel = (x: string | null): x is Exclude<NombreNivel, 'Nuevo'> => x !== 'Nuevo' && NOMBRES_NIVEL.some((n) => n === x)

function numero(texto: string | undefined): number | null {
  if (texto === undefined || texto.trim() === '') return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Lo que va después del "?" en el hash (o en `location.search`). Lo que no se entiende se ignora. */
export function filtrosDeBusqueda(busqueda: string): Filtros {
  const p = new URLSearchParams(busqueda.replace(/^\?/, ''))
  const [min, max] = (p.get('cuota') ?? '').split('-')
  const estado = p.get('estado')
  const tipo = p.get('tipo')
  const duracion = p.get('duracion')
  const nivel = p.get('nivel')
  return {
    q: (p.get('q') ?? '').slice(0, MAX_Q),
    estado: esEstado(estado) ? estado : null,
    tipo: esModo(tipo) ? tipo : null,
    cuotaMin: numero(min),
    cuotaMax: numero(max),
    duracion: esDuracion(duracion) ? duracion : null,
    nivel: esNivel(nivel) ? nivel : null,
    sinPendientes: p.get('sinpendientes') === '1',
    canceladas: p.get('canceladas') === '1',
  }
}

/** Solo lo que no está en su valor por defecto, siempre en el mismo orden (para que la URL no "salte"). */
export function busquedaDeFiltros(f: Filtros): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim().slice(0, MAX_Q))
  if (f.estado) p.set('estado', f.estado)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.cuotaMin !== null || f.cuotaMax !== null) p.set('cuota', `${f.cuotaMin ?? ''}-${f.cuotaMax ?? ''}`)
  if (f.duracion) p.set('duracion', f.duracion)
  if (f.nivel) p.set('nivel', f.nivel)
  if (f.sinPendientes) p.set('sinpendientes', '1')
  if (f.canceladas) p.set('canceladas', '1')
  return p.toString()
}

/** "#/tandas?estado=abiertas…" -> "estado=abiertas…" ("" si no hay filtros). */
export function busquedaDelHash(hash: string): string {
  const i = hash.indexOf('?')
  return i === -1 ? '' : hash.slice(i + 1)
}

/** El hash de la lista con estos filtros: "#/tandas" o "#/tandas?…". */
export function hashDeLista(f: Filtros): string {
  const qs = busquedaDeFiltros(f)
  return qs ? `#/tandas?${qs}` : '#/tandas'
}

// ---------------------------------------------------------------------------
// Recordar los filtros en este navegador (sin el texto buscado: una búsqueda vieja confunde)
// ---------------------------------------------------------------------------

export const CLAVE_FILTROS = 'rounda:filtros'

export function filtrosGuardados(): Filtros | null {
  try {
    const crudo = localStorage.getItem(CLAVE_FILTROS)
    return crudo === null ? null : { ...filtrosDeBusqueda(crudo), q: '' }
  } catch {
    return null
  }
}

export function guardarFiltros(f: Filtros): void {
  try {
    localStorage.setItem(CLAVE_FILTROS, busquedaDeFiltros({ ...f, q: '' }))
  } catch {
    // Sin almacenamiento (modo privado): los filtros duran lo que dure la pestaña.
  }
}
