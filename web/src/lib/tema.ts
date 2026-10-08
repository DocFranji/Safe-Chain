// Diseño en prueba: dos opciones de marca para elegir con la web de verdad (docs/diseno.md). Las dos combinan
// la identidad de la carreta de Sarchí con la seriedad de una app de finanzas:
// - "sarchi" (A): el rojo de la carreta en la barra y la portada; los colores pintados viven solo en la rueda.
// - "montana" (B): verde montaña y amarillo; el punto del logo da la vuelta a la rueda y señala a quien cobra.
// Se elige con ?tema=sarchi|montana en la URL (antes del #), con el selector de arriba o con VITE_TEMA.
// Las dos tienen modo oscuro: sigue al teléfono, o se fija con ?modo=claro|oscuro o el botón de la franja.
// Cuando el equipo elija una, se borran este archivo, el selector y la opción que no quedó.
import { useSyncExternalStore } from 'react'

export type Tema = 'sarchi' | 'montana'
export type Modo = 'claro' | 'oscuro'

export const TEMAS: { id: Tema; nombre: string; oscuro: boolean }[] = [
  { id: 'sarchi', nombre: 'A · Sarchí', oscuro: true },
  { id: 'montana', nombre: 'B · Montaña', oscuro: true },
]

export const TEMA_POR_DEFECTO: Tema = 'sarchi'
const CLAVE = 'rounda:tema'
const CLAVE_MODO = 'rounda:modo'

/** Color de la barra del navegador en el celular: el de la barra de la marca. */
const COLOR_BARRA: Record<Tema, Record<Modo, string>> = {
  sarchi: { claro: '#a31f1a', oscuro: '#7f1914' },
  montana: { claro: '#0e3b2c', oscuro: '#0b2a20' },
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

/** Las letras de cada tema, como las pide document.fonts.load (una por familia: son fuentes variables). */
export function letrasDe(tema: Tema): string[] {
  return tema === 'montana'
    ? ['750 1em "Bricolage Grotesque Variable"', '400 1em "Geist Variable"']
    : ['800 1em "Archivo Variable"']
}

/**
 * Pide las letras del tema antes de dibujar la app, con un tope: así el texto no salta cuando llega la fuente
 * (antes lo tapaba la animación de entrada) y la página nunca espera más de `tope` milisegundos.
 */
export function letrasListas(tope = 400): Promise<void> {
  if (!('fonts' in document)) return Promise.resolve()
  const cargar = Promise.all(letrasDe(actual).map((f) => document.fonts.load(f))).then(() => undefined)
  const esperar = new Promise<void>((listo) => setTimeout(listo, tope))
  return Promise.race([cargar, esperar]).catch(() => undefined)
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
