// Rutas de la app. Usan el "hash" de la URL (lo que va después de #), así funcionan
// en cualquier hosting estático sin configurar nada, y el link de invitación es simplemente:
//   https://tu-sitio/#/tanda/3

export type Ruta =
  /** La landing (página de presentación). */
  | { tipo: 'inicio' }
  /** La lista de tandas. */
  | { tipo: 'lobby' }
  | { tipo: 'crear' }
  | { tipo: 'tanda'; id: number }
  /** Vista para proyectar. Sin id elige sola la tanda más relevante; con id se queda fija en esa. */
  | { tipo: 'demo'; id: number | null }
  /** Chequeo previo a la demo (¿está todo listo?). */
  | { tipo: 'estado' }
  | { tipo: 'desconocida' }

function idValido(texto: string): number | null {
  const id = Number(texto)
  return Number.isSafeInteger(id) && id > 0 && id <= 0xffff_ffff ? id : null
}

export function parsearRuta(hash: string): Ruta {
  const limpio = hash.replace(/^#\/?/, '').replace(/\/+$/, '')
  if (limpio === '') return { tipo: 'inicio' }
  if (limpio === 'tandas') return { tipo: 'lobby' }
  if (limpio === 'crear') return { tipo: 'crear' }
  if (limpio === 'estado') return { tipo: 'estado' }
  if (limpio === 'demo') return { tipo: 'demo', id: null }
  const tanda = limpio.match(/^tanda\/(\d+)$/)
  if (tanda) {
    const id = idValido(tanda[1])
    if (id !== null) return { tipo: 'tanda', id }
  }
  const demo = limpio.match(/^demo\/(\d+)$/)
  if (demo) {
    const id = idValido(demo[1])
    if (id !== null) return { tipo: 'demo', id }
  }
  return { tipo: 'desconocida' }
}

export const RUTA_INICIO = '#/'
export const RUTA_LOBBY = '#/tandas'
export const RUTA_CREAR = '#/crear'
export const RUTA_DEMO = '#/demo'
export const RUTA_ESTADO = '#/estado'
export const rutaTanda = (id: number) => `#/tanda/${id}`
export const rutaDemo = (id: number) => `#/demo/${id}`

/** Navega a otra página de la app (por ejemplo, `irA(rutaTanda(3))`). */
export function irA(hash: string): void {
  window.location.hash = hash
}

/** El link completo que se comparte para invitar a una tanda. */
export function linkInvitacion(id: number, origen: string = window.location.origin, ruta: string = window.location.pathname): string {
  return `${origen}${ruta}${rutaTanda(id)}`
}
