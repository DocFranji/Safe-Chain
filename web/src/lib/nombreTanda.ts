// Nombre de la tanda (pedido 5 del plan v5). Las reglas REPLICAN las del contrato (M1: NombreInvalido = 70):
// de 2 a 40 caracteres (se cuentan caracteres, no bytes), letras A–Z con tildes y el resto de Latin-1 (sin × ni ÷),
// números, espacio y . , - _ ! ? ¿ ¡, sin espacio al principio ni al final, y en NFC. El contrato es la fuente de
// verdad; esto solo evita firmar algo que va a rechazar. Lógica pura, sin React ni red (prueba en nombreTanda.test.ts).

export const NOMBRE_MIN = 2
export const NOMBRE_MAX = 40
const SIGNOS = '.,-_!?¿¡'

/** El nombre como se manda al contrato: en NFC, sin espacios al inicio, al final ni dobles (también saltos de línea). */
export function limpiarNombre(texto: string): string {
  return texto.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** ¿Este carácter puede ir en un nombre? */
export function caracterValido(c: string): boolean {
  if (c === ' ' || SIGNOS.includes(c)) return true
  const n = c.codePointAt(0) ?? 0
  if ((n >= 0x30 && n <= 0x39) || (n >= 0x41 && n <= 0x5a) || (n >= 0x61 && n <= 0x7a)) return true
  return n >= 0xc0 && n <= 0xff && n !== 0xd7 && n !== 0xf7
}

/**
 * Lo que está mal con el nombre, en palabras (o null si sirve). Se le pasa el nombre ya limpio. Vacío no es un
 * problema: el nombre es opcional y una tanda sin nombre se muestra como "Tanda 5".
 */
export function problemaDeNombre(limpio: string): string | null {
  if (limpio === '') return null
  const letras = [...limpio]
  if (letras.length < NOMBRE_MIN) return `Usa al menos ${NOMBRE_MIN} caracteres, o déjalo vacío.`
  if (letras.length > NOMBRE_MAX) return `Usa como máximo ${NOMBRE_MAX} caracteres (ahora tiene ${letras.length}).`
  const malo = letras.find((c) => !caracterValido(c))
  if (malo !== undefined) {
    return `No se puede usar «${malo}». Usa letras, números, espacios y estos signos: . , - _ ! ? ¿ ¡`
  }
  return null
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

// --- Validación de M1 (PR #35): mismas reglas, con mensajes para avisar antes de firmar. ---

/** Letras, números, espacio y . , - _ ! ? ¿ ¡ ; más las letras de Latin-1 con tilde (À–ÿ, sin × ni ÷). */
const PERMITIDO = /^[A-Za-z0-9 .,\-_!?¿¡À-ÖØ-öø-ÿ]$/

/** El texto como debe viajar al contrato: normalizado (NFC), para que «é» sea una sola letra. */
export function normalizarNombre(texto: string): string {
  return texto.normalize('NFC')
}

/** Por qué un nombre no sirve, en una frase para la persona; `null` si está bien (o si está vacío: sin nombre). */
export function errorNombre(texto: string): string | null {
  const nombre = normalizarNombre(texto)
  if (nombre === '') return null
  const letras = [...nombre]
  if (letras[0] === ' ' || letras[letras.length - 1] === ' ') return 'El nombre no puede empezar ni terminar con un espacio.'
  if (letras.length < NOMBRE_MIN) return `El nombre debe tener al menos ${NOMBRE_MIN} caracteres.`
  if (letras.length > NOMBRE_MAX) return `El nombre puede tener hasta ${NOMBRE_MAX} caracteres.`
  const raro = letras.find((l) => !PERMITIDO.test(l))
  if (raro !== undefined) {
    return `El nombre solo puede llevar letras, números, espacios y los signos . , - _ ! ? ¿ ¡ (sin «${raro.trim() || 'ese espacio'}»).`
  }
  return null
}

/** El nombre listo para el contrato: normalizado y vacío si la persona no puso nada. */
export function nombreParaContrato(texto: string): string {
  return normalizarNombre(texto)
}
