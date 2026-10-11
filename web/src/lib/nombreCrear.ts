// Lo que usa la pantalla de Crear alrededor del nombre de la tanda (pedido 5 del plan v5). Las reglas del nombre
// están en nombreTanda.ts (las del contrato); aquí solo se limpia lo que la persona escribe y se lee el resultado
// de crear. Lógica pura, sin React ni red (prueba en nombreCrear.test.ts).
import { normalizarNombre } from './nombreTanda'

/** Lo escrito, listo para validar y enviar: en NFC, sin espacios al inicio, al final ni dobles (tampoco saltos de línea). */
export function limpiarNombre(texto: string): string {
  return normalizarNombre(texto).replace(/\s+/g, ' ').trim()
}

/** Lo que devuelve crear una tanda: el número, o un `Result` con el número, según cómo lo declare el contrato. */
export function idDeCreacion(valor: unknown): number {
  let v = valor
  if (v !== null && typeof v === 'object' && typeof (v as { isErr?: unknown }).isErr === 'function') {
    const r = v as { isErr(): boolean; unwrap(): unknown }
    if (r.isErr()) throw new Error('El contrato rechazó los datos de la tanda.')
    v = r.unwrap()
  }
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('La red devolvió un número de tanda inesperado.')
  return v
}
