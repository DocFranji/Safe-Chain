// Claro u oscuro y las letras de Rounda (diseño Órbita, DESIGN.md).
// El modo sigue al teléfono o la computadora; ?modo=claro|oscuro en la URL (antes del #) lo fija, por ejemplo para
// grabar el video. Se aplica antes de dibujar la app para que no parpadee el modo equivocado.
import { useSyncExternalStore } from 'react'

export type Modo = 'claro' | 'oscuro'

/** Color de la barra del navegador en el celular: el marino de la marca. */
const COLOR_BARRA: Record<Modo, string> = { claro: '#070c24', oscuro: '#05070f' }

/** Las letras de la marca, como las pide document.fonts.load (Geist es variable: una por peso que se usa). */
export const LETRAS = ['500 1em "Geist Variable"', '400 1em "Geist Variable"']

export function esModo(x: unknown): x is Modo {
  return x === 'claro' || x === 'oscuro'
}

/** Claro u oscuro: manda la URL y, si no dice nada, el sistema. */
export function elegirModo(busqueda: string, sistemaOscuro: boolean): Modo {
  const deUrl = new URLSearchParams(busqueda).get('modo')
  if (esModo(deUrl)) return deUrl
  return sistemaOscuro ? 'oscuro' : 'claro'
}

function sistemaOscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

let modo: Modo = 'claro'
const oyentes = new Set<() => void>()

function aplicar() {
  modo = elegirModo(window.location.search, sistemaOscuro())
  document.documentElement.dataset.modo = modo
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[modo])
  oyentes.forEach((avisar) => avisar())
}

/** Se llama una vez, antes de dibujar la app. Después sigue al sistema cuando cambia (por ejemplo, de noche). */
export function iniciarApariencia() {
  aplicar()
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicar)
  }
}

/**
 * Pide las letras antes de dibujar la app, con un tope: así el texto no salta cuando llega la fuente y la página
 * nunca espera más de `tope` milisegundos.
 */
export function letrasListas(tope = 400): Promise<void> {
  if (!('fonts' in document)) return Promise.resolve()
  const cargar = Promise.all(LETRAS.map((f) => document.fonts.load(f))).then(() => undefined)
  const esperar = new Promise<void>((listo) => setTimeout(listo, tope))
  return Promise.race([cargar, esperar]).catch(() => undefined)
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  return () => {
    oyentes.delete(avisar)
  }
}

export function useModo(): Modo {
  return useSyncExternalStore(suscribir, () => modo)
}
