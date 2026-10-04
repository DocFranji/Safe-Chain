// Blend: lo que la web necesita saber de la bóveda con rendimiento real (ver docs/blend.md).
// - Liquidez libre del pool: cuánto se puede retirar hoy. Si no alcanza, cerrar una ronda con impagos o
//   finalizar fallan con el error 1207 y se reintentan después; el dinero no se pierde.
// Los mensajes de los errores del adaptador (50–53) y de Blend (1206, 1207, 1220, 1223) están en
// `contrato.ts` (MENSAJES), con los de la tanda.
// La lógica es pura (se prueba sin red); `leerLiquidezBlend` es la única que consulta la red.
import { Address } from '@stellar/stellar-sdk'
import { monto } from './formato'
import { simular } from './rpc'

/** El b_rate y el d_rate de Blend v2 usan 12 decimales. */
const ESCALA_12 = 10n ** 12n

/** Lo que nos importa de `get_reserve` del pool (campos de Blend v2). */
export type ReservaBlend = {
  data: { b_rate: bigint; b_supply: bigint; d_rate: bigint; d_supply: bigint }
}

export type LiquidezBlend = {
  /** Depositado en la reserva (en unidades de 7 decimales). */
  depositado: bigint
  /** Prestado a otros usuarios de Blend. */
  prestado: bigint
  /** Lo que se puede retirar hoy sin dejar la reserva al 100 % prestada. */
  libre: bigint
  /** Porcentaje prestado (0–100), con dos decimales. */
  utilizacion: number
}

/**
 * Igual que Blend v2 (`pool/src/pool/reserve.rs`): lo depositado se redondea hacia abajo y lo prestado
 * hacia arriba. Un retiro falla (error 1207) si deja lo prestado >= lo depositado.
 */
export function liquidezDeReserva(r: ReservaBlend): LiquidezBlend {
  const depositado = (r.data.b_supply * r.data.b_rate) / ESCALA_12
  const prestado = (r.data.d_supply * r.data.d_rate + ESCALA_12 - 1n) / ESCALA_12
  const libre = depositado > prestado ? depositado - prestado : 0n
  const utilizacion = depositado > 0n ? Number((prestado * 10_000n) / depositado) / 100 : 0
  return { depositado, prestado, libre, utilizacion }
}

/** "Blend tiene 28 453 USDC libres para retirar (78 % prestado)." */
export function textoLiquidez(l: LiquidezBlend, simbolo: string): string {
  const prestado = l.utilizacion.toLocaleString('es-CR', { maximumFractionDigits: 0 })
  return `Blend tiene ${monto(l.libre)} ${simbolo} libres para retirar (${prestado} % prestado).`
}

/** ¿Alcanza la liquidez para sacar `necesario` (por ejemplo, la garantía de toda una tanda)? */
export function alcanzaLiquidez(l: LiquidezBlend, necesario: bigint): boolean {
  return l.libre > necesario
}

/** Lee la reserva de `token` en el pool de Blend y calcula su liquidez. Solo lectura, sin firma. */
export async function leerLiquidezBlend(pool: string, token: string): Promise<LiquidezBlend> {
  const r = (await simular(pool, 'get_reserve', [new Address(token).toScVal()])) as ReservaBlend
  return liquidezDeReserva(r)
}
