// Glosario de Rounda: una sola palabra por concepto en toda la interfaz.
//
// Quien usa Rounda no debería saber que hay una blockchain detrás. Antes de escribir un texto nuevo,
// busca aquí la palabra del concepto. Si el concepto no está, agrégalo (y su prueba en glosario.test.ts).
// El código y el contrato siguen usando sus nombres de siempre (colateral, bolsa, ronda...): esto es
// solo lo que se ve en pantalla.
import { DECIMALES } from '../config'

export type Termino = {
  /** Las palabras que ya no se muestran. */
  antes: string[]
  /** La única palabra que se usa ahora. */
  ahora: string
  /** Forma corta, cuando el concepto ya se nombró en la misma pantalla. */
  corto?: string
  nota?: string
}

export const GLOSARIO: Termino[] = [
  {
    antes: ['garantía', 'colateral'],
    ahora: 'depósito de seguridad',
    corto: 'depósito',
    nota: 'Lo deja cada persona al unirse y lo recupera al final, con intereses.',
  },
  { antes: ['bolsa'], ahora: 'pozo', nota: 'Lo que recibe quien cobra en cada turno.' },
  {
    antes: ['ronda'],
    ahora: 'turno',
    nota: 'En la tanda de siempre, el turno N es el pago N y cobra quien tiene el turno N.',
  },
  {
    antes: ['mora', 'moroso'],
    ahora: 'pago pendiente',
    nota: '"Deuda" y "debe $20" sí se usan: son palabras de todos los días.',
  },
  { antes: ['TUSD', 'USDC'], ahora: 'dólares de práctica', nota: 'Los montos se escriben $20 o $11,27.' },
  { antes: ['rendimiento'], ahora: 'intereses' },
  { antes: ['billetera', 'wallet'], ahora: 'cuenta' },
  { antes: ['firmar'], ahora: 'confirmar' },
  { antes: ['cerrar la ronda'], ahora: 'entregar el pozo' },
  { antes: ['finalizar', 'liquidar'], ahora: 'repartir lo que queda' },
  { antes: ['historial crediticio'], ahora: 'reputación' },
]

/**
 * Palabras que no deben aparecer en el camino principal (crear, unirse, pagar, cobrar, terminar).
 * Las pruebas de navegador lo revisan. Pueden aparecer en "Opciones avanzadas", en #/estado y en el pie.
 */
export const JERGA = ['TUSD', 'garantía', 'colateral', 'bolsa', 'ronda', 'moroso', 'mora', 'XLM', 'Friendbot', 'trustline', 'bóveda']

const UNIDAD = 10n ** DECIMALES

/**
 * Un monto como en la vida real: 200_000_000n -> "$20" · 112_712_316n -> "$11,27" · 10_000_000_000n -> "$1 000".
 * Los centavos sobrantes (más allá de 2 decimales) se cortan, como en `monto`. Negativos: "−$5".
 */
export function dinero(valor: bigint): string {
  const negativo = valor < 0n
  const abs = negativo ? -valor : valor
  const entero = Number(abs / UNIDAD).toLocaleString('es-CR')
  const centavos = Number(((abs % UNIDAD) * 100n) / UNIDAD)
  const texto = centavos > 0 ? `$${entero},${String(centavos).padStart(2, '0')}` : `$${entero}`
  return negativo ? `−${texto}` : texto
}

/**
 * Como `dinero`, pero sin esconder los montos muy chicos: los intereses reales de Blend en minutos son
 * centavos de centavo y con 2 decimales se vería "$0". 39n -> "$0,0000039" · 1_234_567n -> "$0,12".
 */
export function dineroFino(valor: bigint): string {
  const abs = valor < 0n ? -valor : valor
  if (abs === 0n || abs >= 100_000n) return dinero(valor)
  const texto = `$0,${String(abs).padStart(Number(DECIMALES), '0').replace(/0+$/, '')}`
  return valor < 0n ? `−${texto}` : texto
}
