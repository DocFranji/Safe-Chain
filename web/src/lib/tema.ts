// Diseño en prueba: dos mundos visuales para elegir con la web de verdad (docs/diseno.md).
// - "carreta": la rueda pintada de la carreta de Sarchí.
// - "fintech": una app de finanzas moderna, hecha con el nivel de las mejores del rubro.
// Se elige con ?tema=carreta|fintech en la URL (antes del #), con el selector de arriba o con VITE_TEMA.
// Cuando el equipo elija uno, se borran este archivo, el selector y el tema que no quedó.
import { useSyncExternalStore } from 'react'

export type Tema = 'carreta' | 'fintech'

export const TEMAS: { id: Tema; nombre: string }[] = [
  { id: 'carreta', nombre: 'Carreta de Sarchí' },
  { id: 'fintech', nombre: 'Fintech' },
]

export const TEMA_POR_DEFECTO: Tema = 'carreta'
const CLAVE = 'rounda:tema'

export function esTema(x: unknown): x is Tema {
  return x === 'carreta' || x === 'fintech'
}

/** Qué tema mostrar: manda la URL (para compartir un enlace), luego lo último elegido y luego la configuración. */
export function elegirTema(busqueda: string, guardado: string | null, deEntorno: string | undefined): Tema {
  const deUrl = new URLSearchParams(busqueda).get('tema')
  if (esTema(deUrl)) return deUrl
  if (esTema(guardado)) return guardado
  if (esTema(deEntorno)) return deEntorno
  return TEMA_POR_DEFECTO
}

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

let actual: Tema = TEMA_POR_DEFECTO
const oyentes = new Set<() => void>()

export function aplicarTema(tema: Tema) {
  actual = tema
  document.documentElement.dataset.tema = tema
  // Color de la barra del navegador en el celular, a juego con cada tema.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'carreta' ? '#c8261b' : '#ffffff')
  try {
    localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento (modo privado): el tema dura lo que dure la pestaña.
  }
  oyentes.forEach((avisar) => avisar())
}

/** Se llama una vez, antes de dibujar la app, para que no parpadee el tema equivocado. */
export function iniciarTema() {
  aplicarTema(elegirTema(window.location.search, leerGuardado(), import.meta.env.VITE_TEMA))
}

export function useTema(): Tema {
  return useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar)
      return () => oyentes.delete(avisar)
    },
    () => actual,
  )
}
