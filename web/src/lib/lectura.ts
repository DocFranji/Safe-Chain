// Lecturas del contrato (no piden firma ni cuestan nada). Las usan el lobby y la página de cada tanda.
import type { Deuda, Miembro, Tanda } from 'tanda'
import { clienteLectura, leer, revisarSimulacion } from './contrato'

export type MiembroConDireccion = Miembro & { direccion: string }

/** La deuda de alguien (a quién le debe, su bolsa retenida, cuánto ha pagado). */
export type DeudaConDireccion = Deuda & { direccion: string }

export type EstadoTag = Tanda['estado']['tag']

/** Lo mínimo para dibujar una tarjeta en el lobby. */
export type ResumenTanda = {
  id: number
  tanda: Tanda
  /** Ordenados por turno (posicion 0 cobra primero). */
  miembros: MiembroConDireccion[]
}

/** Todo lo que necesita la página de una tanda. */
export type DatosTanda = {
  tanda: Tanda
  miembros: MiembroConDireccion[]
  /** Direcciones que ya pagaron la ronda actual. */
  pagaron: string[]
  /** Momento (segundos Unix) en que vence la ronda actual. */
  vence: number
  /** Garantía que pagaría la próxima persona en unirse (solo si la tanda está abierta). */
  colateralSiguiente: bigint | null
  /** Bóveda donde está la garantía de esta tanda (null si no se pudo leer). */
  boveda: string | null
  /** Deudas de quienes alguna vez debieron algo, incluidas las ya saldadas (vacío si nadie se atrasó). */
  deudas: DeudaConDireccion[]
}

export function ordenarMiembros(lista: [string, Miembro][]): MiembroConDireccion[] {
  return lista.map(([direccion, m]) => ({ ...m, direccion })).sort((a, b) => a.posicion - b.posicion)
}

export const esTerminal = (estado: EstadoTag) => estado === 'Finalizada' || estado === 'Cancelada'

/**
 * Cuántas tandas existen. Ojo: si la red falla, el SDK NO lanza una excepción sino que devuelve
 * un objeto de error en `.result`; por eso se revisa la simulación y que el valor sea un número.
 */
export async function leerTotal(): Promise<number> {
  const tx = await clienteLectura().total_tandas()
  revisarSimulacion(tx)
  const valor: unknown = tx.result
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) {
    throw new Error('La red devolvió un valor inesperado al contar las tandas.')
  }
  return valor
}

export async function leerResumen(id: number): Promise<ResumenTanda> {
  const c = clienteLectura()
  const [tanda, lista] = await Promise.all([c.get_tanda({ id }).then(leer), c.get_miembros({ id }).then(leer)])
  return { id, tanda, miembros: ordenarMiembros(lista) }
}

// La bóveda de una tanda no cambia nunca: se lee una sola vez.
const bovedas = new Map<number, Promise<string | null>>()
function bovedaDe(id: number): Promise<string | null> {
  let b = bovedas.get(id)
  if (!b) {
    b = clienteLectura()
      .get_boveda({ id })
      .then(leer)
      .catch(() => {
        bovedas.delete(id) // se reintenta en la próxima lectura
        return null
      })
    bovedas.set(id, b)
  }
  return b
}

export async function leerTandaCompleta(id: number): Promise<DatosTanda> {
  const c = clienteLectura()
  const [tanda, lista, ronda, boveda] = await Promise.all([
    c.get_tanda({ id }).then(leer),
    c.get_miembros({ id }).then(leer),
    c.get_ronda({ id }).then(leer),
    bovedaDe(id),
  ])
  const miembros = ordenarMiembros(lista)
  let colateralSiguiente: bigint | null = null
  if (tanda.estado.tag === 'Abierta' && lista.length < tanda.n_miembros) {
    colateralSiguiente = await c.colateral_siguiente({ id }).then(leer)
  }
  // Solo puede haber deudas si alguien se atrasó alguna vez.
  let deudas: DeudaConDireccion[] = []
  if (miembros.some((m) => m.atrasos > 0)) {
    const lista = await c.get_deudas({ id }).then(leer)
    deudas = lista.map(([direccion, d]) => ({ ...d, direccion }))
  }
  return {
    tanda,
    miembros,
    pagaron: ronda[2],
    vence: Number(ronda[1]),
    colateralSiguiente,
    boveda,
    deudas,
  }
}
