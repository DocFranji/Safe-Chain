// Rutas de la app. Usan el "hash" de la URL (lo que va después de #), así funcionan
// en cualquier hosting estático sin configurar nada, y el link de invitación es simplemente:
//   https://tu-sitio/#/tanda/3

export type Ruta =
  | { tipo: 'lobby' }
  | { tipo: 'crear' }
  | { tipo: 'tanda'; id: number }
  | { tipo: 'desconocida' }

export function parsearRuta(hash: string): Ruta {
  const limpio = hash.replace(/^#\/?/, '').replace(/\/+$/, '')
  if (limpio === '') return { tipo: 'lobby' }
  if (limpio === 'crear') return { tipo: 'crear' }
  const m = limpio.match(/^tanda\/(\d+)$/)
  if (m) {
    const id = Number(m[1])
    if (Number.isSafeInteger(id) && id > 0 && id <= 0xffff_ffff) return { tipo: 'tanda', id }
  }
  return { tipo: 'desconocida' }
}

export const RUTA_LOBBY = '#/'
export const RUTA_CREAR = '#/crear'
export const rutaTanda = (id: number) => `#/tanda/${id}`

/** Navega a otra página de la app (por ejemplo, `irA(rutaTanda(3))`). */
export function irA(hash: string): void {
  window.location.hash = hash
}

/** El link completo que se comparte para invitar a una tanda. */
export function linkInvitacion(id: number, origen: string = window.location.origin, ruta: string = window.location.pathname): string {
  return `${origen}${ruta}${rutaTanda(id)}`
}
