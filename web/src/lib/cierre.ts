// La pantalla de cierre: cuánto puso, cuánto recibió y qué pasó con el depósito de quien mira.
// Los montos del final solo están en los eventos (la red los guarda unos días): si faltan, se dice menos.
// Lógica pura: cierre.test.ts.
import type { EventoTanda } from './historia'

export type Cierre = {
  /** Lo que puso en cuotas: una por turno. */
  cuotas: bigint
  /** El pozo que recibió (null si la red ya no guarda ese evento). */
  pozo: bigint | null
  /** El depósito de seguridad que dejó al unirse. */
  deposito: bigint
  /** Lo que se le devolvió al final (null si no se sabe). */
  devuelto: bigint | null
  /** devuelto − depósito: intereses y su parte de las multas (negativo si el depósito cubrió cuotas). */
  ganancia: bigint | null
}

export function cierreDe(
  eventos: EventoTanda[],
  yo: string,
  m: { colateral_inicial: bigint },
  cuota: bigint,
  n: number,
): Cierre {
  let pozo: bigint | null = null
  let devuelto: bigint | null = null
  const sumar = (a: bigint | null, b: bigint) => (a ?? 0n) + b
  for (const { evento: e } of eventos) {
    if (e.name === 'EvRonda' && e.data.beneficiario === yo && e.data.monto_pagado !== undefined && e.data.monto_pagado > 0n) {
      pozo = sumar(pozo, e.data.monto_pagado)
    } else if (e.name === 'EvBolsaRecuperada' && e.data.miembro === yo && e.data.monto !== undefined) {
      pozo = sumar(pozo, e.data.monto)
    } else if (e.name === 'EvLiquidado' && e.data.miembro === yo && e.data.monto !== undefined) {
      devuelto = sumar(devuelto, e.data.monto)
    }
  }
  return {
    cuotas: cuota * BigInt(n),
    pozo,
    deposito: m.colateral_inicial,
    devuelto,
    ganancia: devuelto === null ? null : devuelto - m.colateral_inicial,
  }
}
