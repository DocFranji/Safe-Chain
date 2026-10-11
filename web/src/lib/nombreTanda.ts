// Nombre de la tanda (v5): las mismas reglas que `nombres.rs` en el contrato, para avisar antes de firmar.
// Lógica pura, sin red ni React. Si cambias una regla aquí, cámbiala también allá (y al revés).

/** Caracteres mínimo y máximo de un nombre (el vacío significa "sin nombre"). */
export const NOMBRE_MIN = 2
export const NOMBRE_MAX = 40

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
