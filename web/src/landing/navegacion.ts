import type { MouseEvent } from 'react'

/**
 * Las rutas de la app usan el # de la URL (#/tandas, #/tanda/3...). Por eso las anclas de esta página
 * NO pueden ser href="#como": cambiarían la ruta y saldría "Esa página no existe". Se desplaza con scroll.
 */
export function irASeccion(id: string) {
  return (e: MouseEvent) => {
    e.preventDefault()
    const destino = document.getElementById(id)
    if (!destino) return
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    destino.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' })
  }
}
