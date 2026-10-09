// Claro u oscuro y las letras de Rounda (diseño Órbita, DESIGN.md).
// El modo arranca según el teléfono o la computadora. Cada persona lo cambia con el botón de la barra (BotonModo) y
// queda guardado en su navegador; ?modo=claro|oscuro en la URL (antes del #) manda sobre todo, por ejemplo para
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

const CLAVE = 'rounda:modo'

/** Claro u oscuro: manda la URL, luego lo que la persona eligió con el botón y, si no eligió, el sistema. */
export function elegirModo(busqueda: string, guardado: string | null, sistemaOscuro: boolean): Modo {
  const deUrl = new URLSearchParams(busqueda).get('modo')
  if (esModo(deUrl)) return deUrl
  if (esModo(guardado)) return guardado
  return sistemaOscuro ? 'oscuro' : 'claro'
}

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

function guardar(valor: Modo) {
  try {
    localStorage.setItem(CLAVE, valor)
  } catch {
    // Sin almacenamiento (modo privado): la elección dura lo que dure la pestaña.
  }
}

function sistemaOscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

let modo: Modo = 'claro'
const oyentes = new Set<() => void>()

function pintar() {
  document.documentElement.dataset.modo = modo
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[modo])
  oyentes.forEach((avisar) => avisar())
}

function aplicar() {
  modo = elegirModo(window.location.search, leer(), sistemaOscuro())
  pintar()
}

/** Lo que hace el botón de la barra: cambia el modo y lo recuerda en este navegador. */
export function cambiarModo(nuevo: Modo) {
  modo = nuevo
  guardar(nuevo)
  pintar()
}

/** Se llama una vez, antes de dibujar la app. Si nadie eligió, sigue al sistema cuando cambia (de noche, por ejemplo). */
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
