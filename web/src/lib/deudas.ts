// Cálculos de la deuda de un moroso que REPLICAN lo que hace `pagar_deuda` en el contrato
// (contracts/tanda/src/deudas.rs), para explicarlo antes de firmar. Sin imports de red: se prueba sola.

/** Lo mínimo que la web necesita de una deuda (es la `Deuda` del contrato). */
export type DeudaResumen = {
  faltantes: { ronda: number; acreedor: string; monto: bigint }[]
  bolsa_retenida: bigint
  pagado: bigint
}

/** Lo que recupera al saldar: su bolsa retenida, menos sus multas pendientes. */
export type Recupero = { bolsa: bigint; multas: bigint; neto: bigint }

/**
 * Si `yo` salda toda su deuda, ¿recupera una bolsa retenida? Su bolsa retenida crece con lo que él mismo
 * debía de su propia ronda (esa parte del pago va a su bolsa), y de ahí se descuentan sus multas pendientes.
 */
export function bolsaQueRecupera(d: DeudaResumen | undefined, yo: string, multasPendientes: bigint): Recupero | null {
  if (!d) return null
  const propia = d.faltantes.filter((f) => f.acreedor === yo).reduce((s, f) => s + f.monto, 0n)
  const bolsa = d.bolsa_retenida + propia
  if (bolsa <= 0n) return null
  const multas = multasPendientes < bolsa ? multasPendientes : bolsa
  return { bolsa, multas, neto: bolsa - multas }
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
