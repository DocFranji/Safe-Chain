// Amigos (pedido 6 del plan v5): personas que alguien guarda con un apodo para invitarlas rápido a una tanda.
// Viven solo en el navegador de quien los guarda (rounda:amigos:<cuenta>): no hay nada en el contrato ni en un
// servidor, así que son privados y no se ven desde otro teléfono ni computadora. Lógica pura, sin React ni red
// (prueba en amigos.test.ts).
import { StrKey } from '@stellar/stellar-sdk'
import type { Almacen } from './almacen'

export type Amigo = { dir: string; apodo: string }

/** Cuántos amigos se guardan como máximo por cuenta. */
export const MAX_AMIGOS = 100
export const APODO_AMIGO_MIN = 1
export const APODO_AMIGO_MAX = 30

export const claveAmigos = (cuenta: string) => `rounda:amigos:${cuenta}`

/** Una cuenta de Stellar (G… de 56 caracteres con su código de verificación). Un amigo es una persona, no un contrato. */
export function esCuenta(texto: string): boolean {
  return StrKey.isValidEd25519PublicKey(texto)
}

/** Lo que alguien pega: sin espacios, saltos de línea ni mayúsculas/minúsculas mezcladas por un corrector. */
export function limpiarDireccion(texto: string): string {
  return texto.replace(/\s+/g, '').toUpperCase()
}

/** El apodo como se guarda: sin espacios al inicio, al final ni dobles. */
export function limpiarApodo(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

export type Problema = { campo: 'dir' | 'apodo'; texto: string }

/** Lo que está mal al agregar un amigo, en palabras (o null si se puede guardar). `dir` y `apodo` ya limpios. */
export function problemaDeAmigo(dir: string, apodo: string, yo: string, amigos: Amigo[]): Problema | null {
  if (dir === '') return { campo: 'dir', texto: 'Pega la dirección de tu amigo: empieza con G y tiene 56 letras y números.' }
  if (!esCuenta(dir)) {
    return { campo: 'dir', texto: 'Esa dirección no es válida. Revisa que esté completa: empieza con G y tiene 56 caracteres.' }
  }
  if (dir === yo) return { campo: 'dir', texto: 'Esa dirección es la tuya.' }
  const repetido = amigos.find((a) => a.dir === dir)
  if (repetido) return { campo: 'dir', texto: `Ya tienes a ${repetido.apodo} en tus amigos.` }
  const letras = [...apodo]
  if (letras.length < APODO_AMIGO_MIN) return { campo: 'apodo', texto: 'Escribe cómo le dices (por ejemplo, Beto).' }
  if (letras.length > APODO_AMIGO_MAX) return { campo: 'apodo', texto: `Usa como máximo ${APODO_AMIGO_MAX} caracteres.` }
  if (/\p{Cc}/u.test(apodo)) return { campo: 'apodo', texto: 'Usa solo letras, números y signos.' }
  if (amigos.length >= MAX_AMIGOS) return { campo: 'dir', texto: `Ya tienes ${MAX_AMIGOS} amigos: quita alguno para agregar otro.` }
  return null
}

function esAmigo(x: unknown): x is Amigo {
  if (typeof x !== 'object' || x === null) return false
  const { dir, apodo } = x as Record<string, unknown>
  return typeof dir === 'string' && esCuenta(dir) && typeof apodo === 'string' && apodo.trim() !== '' && [...apodo].length <= APODO_AMIGO_MAX
}

/** Los amigos que dice un texto guardado, en orden. Lo que no sirve (o está repetido) se ignora. */
export function amigosDeTexto(crudo: string | null | undefined): Amigo[] {
  try {
    if (!crudo) return []
    const dato: unknown = JSON.parse(crudo)
    if (!Array.isArray(dato)) return []
    const salida: Amigo[] = []
    for (const x of dato) if (esAmigo(x) && !salida.some((a) => a.dir === x.dir)) salida.push(x)
    return salida.slice(0, MAX_AMIGOS)
  } catch {
    return []
  }
}

/** Los amigos de esta cuenta, en el orden en que los agregó. */
export function leerAmigos(almacen: Almacen | null, cuenta: string): Amigo[] {
  try {
    return amigosDeTexto(almacen?.getItem(claveAmigos(cuenta)))
  } catch {
    return []
  }
}

/** Guarda la lista. Devuelve false si el navegador no deja guardar (ventana privada). */
export function guardarAmigos(almacen: Almacen | null, cuenta: string, amigos: Amigo[]): boolean {
  try {
    if (!almacen) return false
    almacen.setItem(claveAmigos(cuenta), JSON.stringify(amigos.slice(0, MAX_AMIGOS).map(({ dir, apodo }) => ({ dir, apodo }))))
    return true
  } catch {
    return false
  }
}

/** La lista con el amigo nuevo al final (sin repetir por dirección). */
export function conAmigo(amigos: Amigo[], nuevo: Amigo): Amigo[] {
  return [...amigos.filter((a) => a.dir !== nuevo.dir), nuevo]
}

export function sinAmigo(amigos: Amigo[], dir: string): Amigo[] {
  return amigos.filter((a) => a.dir !== dir)
}

/** El apodo con el que la persona guardó a `dir`, o null si no es su amigo. */
export function apodoDeAmigo(amigos: Amigo[], dir: string): string | null {
  return amigos.find((a) => a.dir === dir)?.apodo ?? null
}
