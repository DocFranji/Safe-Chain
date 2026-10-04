// Cálculos de la deuda de un moroso que REPLICAN lo que hace `pagar_deuda` en el contrato
// (contracts/tanda/src/deudas.rs), para explicarlo antes de firmar. Sin imports de red: se prueba sola.

/** Lo mínimo que la web necesita de una deuda (es la `Deuda` del contrato). */
export type DeudaResumen = {
  faltantes: { ronda: number; acreedor: string; monto: bigint }[]
  bolsa_retenida: bigint
  pagado: bigint
}

/** Lo que recupera al saldar: su bolsa retenida, menos sus multas y la garantía que se repone. */
export type Recupero = { bolsa: bigint; multas: bigint; garantia: bigint; neto: bigint }

const min = (a: bigint, b: bigint) => (a < b ? a : b)

/**
 * Garantía para las cuotas que todavía debe quien salda en plena tanda (como `garantia_para` en
 * deudas.rs): las de esta ronda en adelante, con la fórmula de la garantía escalonada y piso de una
 * cuota, menos la garantía que ya tiene. Si la tanda ya no está en curso, 0.
 */
export function garantiaPendiente(
  t: { estado: string; n_miembros: number; ronda_actual: number; cuota: bigint; cobertura_bps: number },
  colateralActual: bigint,
): bigint {
  if (t.estado !== 'Activa') return 0n
  const restantes = BigInt(t.n_miembros - t.ronda_actual)
  if (restantes <= 0n) return 0n
  const base = (t.cuota * restantes * BigInt(t.cobertura_bps)) / 10_000n
  const objetivo = base > t.cuota ? base : t.cuota
  return objetivo > colateralActual ? objetivo - colateralActual : 0n
}

/**
 * Si `yo` salda toda su deuda, ¿recupera una bolsa retenida? Su bolsa retenida crece con lo que él mismo
 * debía de su propia ronda (esa parte del pago va a su bolsa). De ahí se descuentan sus multas pendientes
 * y, si la tanda sigue, la garantía para las cuotas que aún debe (`garantia`, de `garantiaPendiente`).
 */
export function bolsaQueRecupera(
  d: DeudaResumen | undefined,
  yo: string,
  multasPendientes: bigint,
  garantia = 0n,
): Recupero | null {
  if (!d) return null
  const propia = d.faltantes.filter((f) => f.acreedor === yo).reduce((s, f) => s + f.monto, 0n)
  const bolsa = d.bolsa_retenida + propia
  if (bolsa <= 0n) return null
  const multas = min(multasPendientes, bolsa)
  const aparte = min(garantia, bolsa - multas)
  return { bolsa, multas, garantia: aparte, neto: bolsa - multas - aparte }
}

/** Ya saldó una deuda en esta tanda (y no debe nada ahora). */
export function saldoSuDeuda(d: DeudaResumen | undefined, moroso: boolean): boolean {
  return !!d && !moroso && d.faltantes.length === 0 && d.pagado > 0n
}

/** El monto que escribió la persona es válido para pagar una deuda de `deuda`. */
export function errorMontoDeuda(monto: bigint | null, deuda: bigint): string | null {
  if (monto === null || monto <= 0n) return 'Escribe un monto mayor que cero.'
  if (monto > deuda) return 'Es más de lo que debes.'
  return null
}

/**
 * Quiénes no alcanzan a cubrir su cuota si la ronda se cierra ahora, y cuánto falta de cada uno (como
 * `cerrar_ronda`): a quien no pagó, su garantía le cubre la cuota; si no le alcanza, entra lo que tiene y la
 * diferencia falta en la bolsa (esa persona queda debiéndosela a quien cobra).
 */
export function faltantesAlCerrar(
  miembros: { direccion: string; colateral: bigint }[],
  pagaron: string[],
  cuota: bigint,
): { direccion: string; falta: bigint }[] {
  return miembros
    .filter((m) => !pagaron.includes(m.direccion) && m.colateral < cuota)
    .map((m) => ({ direccion: m.direccion, falta: cuota - (m.colateral > 0n ? m.colateral : 0n) }))
}
