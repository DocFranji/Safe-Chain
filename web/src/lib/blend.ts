// Blend: lo que la web necesita saber de la bóveda con rendimiento real (ver docs/blend.md).
// - Liquidez libre del pool: cuánto se puede retirar hoy. Si no alcanza, cerrar una ronda con impagos o
//   finalizar fallan con el error 1207 y se reintentan después; el dinero no se pierde.
// Los mensajes de los errores del adaptador (50–53) y de Blend (1206, 1207, 1220, 1223) están en
// `contrato.ts` (MENSAJES), con los de la tanda.
// La lógica es pura (se prueba sin red); `leerLiquidezBlend` es la única que consulta la red.
import { Address } from '@stellar/stellar-sdk'
import { TANDA_ID } from '../config'
import { monto } from './formato'
import { USDC } from './monedas'
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

export type InfoBlend = { pool: string; token: string }

const infos = new Map<string, Promise<InfoBlend | null>>()

/**
 * ¿Esta bóveda es el adaptador de Blend? Solo él responde `pool()` y `token()`; la bóveda simulada no.
 * Devuelve el pool y el token (para leer la liquidez y enlazar a stellar.expert) o null.
 */
export function infoBlend(boveda: string): Promise<InfoBlend | null> {
  let i = infos.get(boveda)
  if (!i) {
    i = Promise.all([simular(boveda, 'pool'), simular(boveda, 'token')])
      .then(([pool, token]) => ({ pool: String(pool), token: String(token) }))
      .catch(() => null)
    infos.set(boveda, i)
  }
  return i
}

type Evaluacion = { nivel: 'ok' | 'aviso' | 'error'; detalle: string; solucion?: string }

/** Para #/estado: hay de sobra si alcanza para devolver la garantía de varias tandas grandes. */
export const LIQUIDEZ_AVISO = 10_000n * 10_000_000n

export function evaluarLiquidez(l: LiquidezBlend, simbolo: string): Evaluacion {
  const detalle = textoLiquidez(l, simbolo)
  if (l.libre === 0n) {
    return {
      nivel: 'error',
      detalle,
      solucion:
        'Blend está prestado al 100 %: cerrar rondas con impagos y finalizar fallarán (sin perder dinero) hasta que vuelva la liquidez. Usa tandas en TUSD para la demo.',
    }
  }
  if (l.libre < LIQUIDEZ_AVISO) {
    return {
      nivel: 'aviso',
      detalle,
      solucion: 'Hay poca liquidez libre: alcanza para tandas chicas. Si un retiro falla, se reintenta más tarde.',
    }
  }
  return { nivel: 'ok', detalle }
}

/** Para #/estado: ¿el contrato acepta tandas en USDC y cuánta liquidez libre tiene Blend? */
export async function chequeoBlend(): Promise<Evaluacion> {
  if (!USDC) return { nivel: 'ok', detalle: 'Desactivado en esta versión (VITE_USDC_ID vacío): solo tandas en TUSD.' }
  const boveda = (await simular(TANDA_ID, 'get_boveda_token', [new Address(USDC.token).toScVal()]).catch(() => null)) as
    | string
    | null
  if (!boveda) {
    return {
      nivel: 'aviso',
      detalle: 'El contrato de la tanda no tiene una bóveda de Blend para USDC: solo se pueden crear tandas en TUSD.',
      solucion: 'Para activarlo: ACTIVO=usdc bash scripts/desplegar_blend.sh y registrar el adaptador (docs/blend.md).',
    }
  }
  const info = await infoBlend(boveda)
  if (!info) return { nivel: 'error', detalle: 'La bóveda registrada para USDC no responde como el adaptador de Blend.' }
  return evaluarLiquidez(await leerLiquidezBlend(info.pool, info.token), USDC.simbolo)
}
