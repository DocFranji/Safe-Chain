// "Te invitaron a Tanda 5" (pedido 3 del plan v5): cuando alguien abre un enlace de invitación y todavía no se une,
// la campanita se lo recuerda. Se guarda en el navegador, no por cuenta: quien abre el enlace muchas veces todavía
// no inició sesión. La campanita muestra el aviso solo mientras la tanda siga abierta, con lugares libres y sin
// que la persona esté en ella, así que un enlace viejo simplemente deja de avisar.
import type { Almacen } from './almacen'
import { parsearRuta } from './rutas'

export type Invitacion = { id: number; desde: number }

export const CLAVE_INVITACIONES = 'rounda:invitaciones'
/** Cuántas invitaciones se recuerdan como máximo (las más recientes). */
export const MAX_INVITACIONES = 20

function esInvitacion(x: unknown): x is Invitacion {
  if (typeof x !== 'object' || x === null) return false
  const { id, desde } = x as Record<string, unknown>
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && typeof desde === 'number' && Number.isFinite(desde)
}

export function leerInvitaciones(almacen: Almacen | null): Invitacion[] {
  try {
    const crudo = almacen?.getItem(CLAVE_INVITACIONES)
    if (!crudo) return []
    const dato: unknown = JSON.parse(crudo)
    return Array.isArray(dato) ? dato.filter(esInvitacion) : []
  } catch {
    return []
  }
}

/** Anota la invitación (una sola vez por tanda: abrir el enlace otra vez no cambia desde cuándo se la invitó). */
export function guardarInvitacion(almacen: Almacen | null, id: number, ahora: number): void {
  const actuales = leerInvitaciones(almacen)
  if (actuales.some((i) => i.id === id)) return
  try {
    almacen?.setItem(CLAVE_INVITACIONES, JSON.stringify([...actuales, { id, desde: ahora }].slice(-MAX_INVITACIONES)))
  } catch {
    // Sin almacenamiento (modo privado): no se recuerda.
  }
}

/** Si lo primero que abre la persona es la página de una tanda (el enlace que le mandaron), el número de esa tanda. */
export function invitacionDeEntrada(hash: string): number | null {
  const ruta = parsearRuta(hash)
  return ruta.tipo === 'tanda' ? ruta.id : null
}
