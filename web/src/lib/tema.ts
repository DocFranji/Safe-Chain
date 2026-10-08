// Diseño en prueba: varios mundos visuales para elegir con la web de verdad (docs/diseno.md).
// - "carreta": la rueda pintada de la carreta de Sarchí.
// - "fintech": una app de finanzas moderna, hecha con el nivel de las mejores del rubro.
// - "lima": fintech amable; el punto del logo da la vuelta a la rueda y se detiene en quien cobra.
// - "cusuco": la mascota es un cusuco (armadillo), que se enrolla como una bola para protegerse.
// - "ronda": la tanda como una ronda de personas tomadas de la mano, en el morado de la guaria.
// Se elige con ?tema=… en la URL (antes del #), con el selector de arriba o con VITE_TEMA.
// Los tres mundos nuevos tienen modo oscuro: sigue al teléfono, o se fija con ?modo=claro|oscuro o el selector.
// Cuando el equipo elija uno, se borran este archivo, el selector y los temas que no quedaron.
import { useSyncExternalStore } from 'react'

export type Tema = 'carreta' | 'fintech' | 'lima' | 'cusuco' | 'ronda'
export type Modo = 'claro' | 'oscuro'

export const TEMAS: { id: Tema; nombre: string; oscuro: boolean }[] = [
  { id: 'lima', nombre: 'Lima', oscuro: true },
  { id: 'cusuco', nombre: 'Cusuco', oscuro: true },
  { id: 'ronda', nombre: 'Ronda', oscuro: true },
  { id: 'carreta', nombre: 'Carreta de Sarchí', oscuro: false },
  { id: 'fintech', nombre: 'Fintech', oscuro: false },
]

export const TEMA_POR_DEFECTO: Tema = 'carreta'
const CLAVE = 'rounda:tema'
const CLAVE_MODO = 'rounda:modo'

/** Color de la barra del navegador en el celular, a juego con el fondo de cada tema. */
const COLOR_BARRA: Record<Tema, Record<Modo, string>> = {
  carreta: { claro: '#c8261b', oscuro: '#c8261b' },
  fintech: { claro: '#ffffff', oscuro: '#ffffff' },
  lima: { claro: '#f0f2ec', oscuro: '#0f120e' },
  cusuco: { claro: '#e8f0f7', oscuro: '#0e1622' },
  ronda: { claro: '#f7f4f8', oscuro: '#151018' },
}

export function esTema(x: unknown): x is Tema {
  return TEMAS.some((t) => t.id === x)
}

export function esModo(x: unknown): x is Modo {
  return x === 'claro' || x === 'oscuro'
}

export function tieneOscuro(tema: Tema): boolean {
  return TEMAS.find((t) => t.id === tema)?.oscuro ?? false
}

/** Qué tema mostrar: manda la URL (para compartir un enlace), luego lo último elegido y luego la configuración. */
export function elegirTema(busqueda: string, guardado: string | null, deEntorno: string | undefined): Tema {
  const deUrl = new URLSearchParams(busqueda).get('tema')
  if (esTema(deUrl)) return deUrl
  if (esTema(guardado)) return guardado
  if (esTema(deEntorno)) return deEntorno
  return TEMA_POR_DEFECTO
}

/** Claro u oscuro: manda la URL, luego lo elegido a mano y luego el teléfono. Los temas sin oscuro van claros. */
export function elegirModo(tema: Tema, busqueda: string, guardado: string | null, sistemaOscuro: boolean): Modo {
  if (!tieneOscuro(tema)) return 'claro'
  const deUrl = new URLSearchParams(busqueda).get('modo')
  if (esModo(deUrl)) return deUrl
  if (esModo(guardado)) return guardado
  return sistemaOscuro ? 'oscuro' : 'claro'
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento (modo privado): la elección dura lo que dure la pestaña.
  }
}

function sistemaOscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

let actual: Tema = TEMA_POR_DEFECTO
let modo: Modo = 'claro'
const oyentes = new Set<() => void>()

function pintar() {
  const raiz = document.documentElement
  raiz.dataset.tema = actual
  raiz.dataset.modo = modo
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[actual][modo])
  oyentes.forEach((avisar) => avisar())
}

export function aplicarTema(tema: Tema) {
  actual = tema
  modo = elegirModo(tema, window.location.search, leer(CLAVE_MODO), sistemaOscuro())
  guardar(CLAVE, tema)
  pintar()
}

/** Elegir claro u oscuro a mano (queda guardado y manda sobre el teléfono). */
export function aplicarModo(nuevo: Modo) {
  if (!tieneOscuro(actual)) return
  modo = nuevo
  guardar(CLAVE_MODO, nuevo)
  pintar()
}

/** Se llama una vez, antes de dibujar la app, para que no parpadee el tema equivocado. */
export function iniciarTema() {
  aplicarTema(elegirTema(window.location.search, leer(CLAVE), import.meta.env.VITE_TEMA))
  // Si nadie eligió el modo a mano, sigue al teléfono cuando cambia (por ejemplo, de noche).
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema(actual))
  }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  return () => {
    oyentes.delete(avisar)
  }
}

export function useTema(): Tema {
  return useSyncExternalStore(suscribir, () => actual)
}

export function useModo(): Modo {
  return useSyncExternalStore(suscribir, () => modo)
}
