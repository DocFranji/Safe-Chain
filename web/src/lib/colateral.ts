// Cálculos que REPLICAN las reglas del contrato (contracts/tanda/src/lib.rs).
// Sirven para mostrar la vista previa antes de crear o unirse. La fuente de verdad
// sigue siendo el contrato: si cambian una regla allá, cambien también aquí
// (y colateral.test.ts les avisa si dejan de coincidir con las pruebas de Rust).
// No importa nada de config.ts a propósito: así se puede probar sin navegador.

/** Límites de `crear_tanda` (constantes de lib.rs). */
export const MIN_MIEMBROS = 3
export const MAX_MIEMBROS = 12
export const MIN_PERIODO_SEG = 60
export const MAX_PENALIDAD_BPS = 5_000
export const MAX_COBERTURA_BPS = 10_000

const BPS = 10_000n

export type ParametrosTanda = {
  cuota: bigint
  nMiembros: number
  periodoSeg: number
  penalidadBps: number
  coberturaBps: number
}

/** colateral_i = max(cuota, cuota × (n − 1 − i) × cobertura / 100%), igual que `colateral_para`. */
export function colateralDeTurno(
  p: Pick<ParametrosTanda, 'cuota' | 'nMiembros' | 'coberturaBps'>,
  posicion: number,
): bigint {
  const restantes = BigInt(p.nMiembros - 1 - posicion)
  const base = (p.cuota * restantes * BigInt(p.coberturaBps)) / BPS
  return base > p.cuota ? base : p.cuota
}

/** El colateral de cada turno, del primero al último. */
export function tablaColateral(p: Pick<ParametrosTanda, 'cuota' | 'nMiembros' | 'coberturaBps'>): bigint[] {
  return Array.from({ length: p.nMiembros }, (_, i) => colateralDeTurno(p, i))
}

/** Lo que cobra quien recibe la bolsa si todos pagan. */
export function bolsa(p: Pick<ParametrosTanda, 'cuota' | 'nMiembros'>): bigint {
  return p.cuota * BigInt(p.nMiembros)
}

/**
 * Lo máximo que el grupo podría perder si alguien cobra y luego desaparece.
 * Esa persona todavía debe (n − 1 − turno) cuotas; su garantía cubre una parte y el resto
 * queda sin pagar. Con garantía del 100% es cero. Siempre es mayor para quien cobra primero.
 */
export function riesgoMaximo(p: Pick<ParametrosTanda, 'cuota' | 'nMiembros' | 'coberturaBps'>): bigint {
  let peor = 0n
  for (let i = 0; i < p.nMiembros; i++) {
    const debe = p.cuota * BigInt(p.nMiembros - 1 - i)
    const sinCubrir = debe - colateralDeTurno(p, i)
    if (sinCubrir > peor) peor = sinCubrir
  }
  return peor
}

/** Multa por pagar tarde, igual que `multa` en el contrato. */
export function multaPorAtraso(cuota: bigint, penalidadBps: number): bigint {
  return (cuota * BigInt(penalidadBps)) / BPS
}

export type Errores = Partial<Record<keyof ParametrosTanda, string>>

/** Las mismas condiciones que hacen fallar a `crear_tanda` con ParametroInvalido. */
export function validarParametros(p: Partial<ParametrosTanda>): Errores {
  const e: Errores = {}
  if (p.cuota === undefined || p.cuota <= 0n) e.cuota = 'Escribe una cuota mayor que cero.'
  if (
    p.nMiembros === undefined ||
    !Number.isInteger(p.nMiembros) ||
    p.nMiembros < MIN_MIEMBROS ||
    p.nMiembros > MAX_MIEMBROS
  ) {
    e.nMiembros = `Entre ${MIN_MIEMBROS} y ${MAX_MIEMBROS} personas.`
  }
  if (p.periodoSeg === undefined || !Number.isInteger(p.periodoSeg) || p.periodoSeg < MIN_PERIODO_SEG) {
    e.periodoSeg = 'Escribe un número entero: cada ronda debe durar al menos 1 minuto.'
  }
  if (
    p.penalidadBps === undefined ||
    !Number.isInteger(p.penalidadBps) ||
    p.penalidadBps < 0 ||
    p.penalidadBps > MAX_PENALIDAD_BPS
  ) {
    e.penalidadBps = 'La multa va de 0 % a 50 %.'
  }
  if (
    p.coberturaBps === undefined ||
    !Number.isInteger(p.coberturaBps) ||
    p.coberturaBps < 0 ||
    p.coberturaBps > MAX_COBERTURA_BPS
  ) {
    e.coberturaBps = 'La garantía va de 0 % a 100 %.'
  }
  return e
}
