// Convierte lo que escribe la persona (texto) a los números que pide el contrato.
// Sin imports: se puede probar sin navegador.

const DECIMALES = 7
const MAX_TUSD = 1_000_000_000n // tope razonable para evitar errores de dedo (mil millones)

/**
 * "100" -> 1_000_000_000n   |   "12,5" -> 125_000_000n   |   "abc" -> null
 * Acepta coma o punto como separador decimal y hasta 7 decimales (los de TUSD).
 */
export function parseMonto(texto: string): bigint | null {
  const t = texto.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const [entero, decimales = ''] = t.split('.')
  if (decimales.length > DECIMALES) return null
  const valor = BigInt(entero) * 10n ** BigInt(DECIMALES) + BigInt(decimales.padEnd(DECIMALES, '0'))
  if (valor > MAX_TUSD * 10n ** BigInt(DECIMALES)) return null
  return valor
}

export type UnidadPeriodo = 'minutos' | 'horas' | 'dias'

export const SEGUNDOS_POR_UNIDAD: Record<UnidadPeriodo, number> = {
  minutos: 60,
  horas: 3_600,
  dias: 86_400,
}

/** (2, 'minutos') -> 120. Devuelve null si no es un entero positivo. */
export function aSegundos(valor: number, unidad: UnidadPeriodo): number | null {
  if (!Number.isInteger(valor) || valor <= 0) return null
  return valor * SEGUNDOS_POR_UNIDAD[unidad]
}
