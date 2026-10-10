// Mecanismos de turnos (misión M3): reglas que REPLICAN las del contrato (contracts/tanda/src/turnos.rs)
// para mostrar la vista previa antes de crear, unirse u ofertar. La fuente de verdad sigue siendo el
// contrato: turnos.test.ts usa los mismos números que contracts/tanda/src/test_turnos.rs.
// No importa nada de config.ts a propósito: así se puede probar sin navegador.
import type { ModoTurnos, OpcionesTanda } from 'tanda'
import { bolsa, colateralDeTurno, type ParametrosTanda } from './colateral'

/** `Miembro.posicion` de quien todavía no tiene turno (sorteo antes de llenarse, subasta antes de ganar). */
export const SIN_TURNO = 4_294_967_295 // u32::MAX en el contrato
/** Límites de `crear_tanda_avanzada` (turnos.rs). */
export const MAX_PRIMA_BPS = 2_000
export const MAX_DESCUENTO_BPS = 5_000

const BPS = 10_000n

export type Modo = ModoTurnos['tag']

export const tieneTurno = (posicion: number) => posicion !== SIN_TURNO

/** En estos modos cada quien elige un turno libre al unirse. */
export const eligeTurno = (modo: Modo) => modo === 'Eleccion' || modo === 'PrecioPorTurno'

/** En sorteo y subasta el turno no se conoce al unirse: se deja una cuota y el resto de la garantía
 *  se aparta de la bolsa al cobrar. */
export const garantiaAlCobrar = (modo: Modo) => modo === 'Sorteo' || modo === 'Subasta'

/**
 * Lo que la persona elige en el formulario de crear (porcentajes enteros, como los demás campos).
 * `primeros`: cuántos de los primeros turnos piden historial (0 = ninguno; solo donde se elige turno).
 * `puntajePrimeros`: puntaje de historial (M2) que piden esos turnos.
 * `selladas`: subasta con ofertas selladas (se sellan en la primera mitad de la ronda y se revelan después).
 */
export type OpcionesForm = {
  modo: Modo
  intercambio: boolean
  primaPct: number
  descuentoPct: number
  primeros: number
  puntajePrimeros: number
  selladas: boolean
}

export const OPCIONES_CLASICAS: OpcionesForm = {
  modo: 'Llegada',
  intercambio: false,
  primaPct: 10,
  descuentoPct: 30,
  primeros: 0,
  puntajePrimeros: 100,
  selladas: false,
}

export const MODOS: { modo: Modo; titulo: string; lema: string; detalle: string }[] = [
  {
    modo: 'Llegada',
    titulo: 'Por orden de llegada',
    lema: 'Quien entra primero cobra primero',
    detalle: 'Como una tanda de siempre: el turno lo decide el orden en que se unen.',
  },
  {
    modo: 'PrecioPorTurno',
    titulo: 'Precio por turno',
    lema: 'Quien tiene prisa paga, quien espera gana',
    detalle:
      'Cada quien elige su turno al unirse. Los primeros reciben un poco menos y los últimos un poco más: lo que pagan unos lo ganan otros, y Rounda no se queda con nada.',
  },
  {
    modo: 'Subasta',
    titulo: 'Subasta',
    lema: 'Cada turno gana quien acepte recibir menos',
    detalle:
      'En cada turno, quien necesita el dinero ofrece recibir un porcentaje menos del pozo. Gana la oferta más alta y ese descuento se reparte entre los demás. Si nadie oferta, cobra el siguiente de un orden sorteado al empezar.',
  },
  {
    modo: 'Sorteo',
    titulo: 'Sorteo',
    lema: 'Se sortea el orden',
    detalle:
      'Cuando se llena la tanda, se sortea quién cobra en cada turno. Nadie tiene ventaja por llegar antes.',
  },
  {
    modo: 'Eleccion',
    titulo: 'Elegir e intercambiar',
    lema: 'Elijan su turno y cámbienlo entre ustedes',
    detalle:
      'Cada quien elige un turno libre al unirse, sin costo. Después pueden intercambiar turnos, con una compensación si se ponen de acuerdo.',
  },
]

export function tituloModo(modo: Modo): string {
  return MODOS.find((m) => m.modo === modo)?.titulo ?? modo
}

/** Sin nada nuevo: se crea con `crear_tanda`, como siempre. */
export const esClasica = (o: OpcionesForm) => o.modo === 'Llegada' && !o.intercambio

/** ¿Los primeros turnos piden historial? Solo donde cada quien elige su turno. */
const conHistorial = (o: OpcionesForm) => eligeTurno(o.modo) && o.primeros > 0

/** Las opciones del formulario en el formato del contrato (cada modo solo usa sus parámetros). */
export function aContrato(o: OpcionesForm): OpcionesTanda {
  return {
    modo: { tag: o.modo, values: undefined } as ModoTurnos,
    permitir_intercambio: o.modo !== 'Subasta' && o.intercambio,
    prima_max_bps: o.modo === 'PrecioPorTurno' ? Math.round(o.primaPct * 100) : 0,
    descuento_max_bps: o.modo === 'Subasta' ? Math.round(o.descuentoPct * 100) : 0,
    primeros_con_historial: conHistorial(o) ? o.primeros : 0,
    puntaje_primeros: conHistorial(o) ? o.puntajePrimeros : 0,
    ofertas_selladas: o.modo === 'Subasta' && o.selladas,
  }
}

/** Las mismas condiciones que hacen fallar a `crear_tanda_avanzada` con OpcionesInvalidas. */
export function validarOpciones(o: OpcionesForm, nMiembros?: number): string | null {
  const prima = Math.round(o.primaPct * 100)
  const descuento = Math.round(o.descuentoPct * 100)
  if (o.modo === 'PrecioPorTurno' && !(prima >= 1 && prima <= MAX_PRIMA_BPS)) {
    return `La prima del primer turno va de 1 % a ${MAX_PRIMA_BPS / 100} %.`
  }
  if (o.modo === 'Subasta' && !(descuento >= 1 && descuento <= MAX_DESCUENTO_BPS)) {
    return `El descuento máximo va de 1 % a ${MAX_DESCUENTO_BPS / 100} %.`
  }
  if (conHistorial(o)) {
    if (o.puntajePrimeros <= 0) return 'Elige el nivel de historial que piden los primeros turnos.'
    if (nMiembros !== undefined && o.primeros >= nMiembros) {
      return `Deja al menos un turno para cualquiera: con ${nMiembros} personas, pide historial en ${nMiembros - 1} turnos como máximo.`
    }
  }
  return null
}

/** ¿El turno `posicion` pide historial en esta tanda? */
export function pideHistorial(o: Pick<OpcionesTanda, 'primeros_con_historial'> | null | undefined, posicion: number): boolean {
  return !!o && posicion < o.primeros_con_historial
}

/**
 * Turno en el que queda quien crea la tanda y se une enseguida (sin elegir): el 1, salvo que los
 * primeros pidan un historial que no tiene; entonces el primero que no lo pide.
 */
export function turnoAlCrear(o: OpcionesForm, miPuntaje: number): number {
  return conHistorial(o) && miPuntaje < o.puntajePrimeros ? o.primeros : 0
}

/**
 * prima_i = bolsa × prima_max × (n − 1 − 2i) / (n − 1), igual que `prima_de_turno`.
 * Positiva: paga (se descuenta de su bolsa). Negativa: recibe. BigInt redondea hacia cero, como Rust.
 */
export function primaDeTurno(p: Pick<ParametrosTanda, 'cuota' | 'nMiembros'>, primaBps: number, posicion: number): bigint {
  const n = BigInt(p.nMiembros)
  const factor = n - 1n - 2n * BigInt(posicion)
  return (p.cuota * n * BigInt(primaBps) * factor) / ((n - 1n) * BPS)
}

/** Garantía que se deja al unirse en el turno `posicion` (sin turno: la del último, una cuota). */
export function garantiaAlUnirse(p: Pick<ParametrosTanda, 'cuota' | 'nMiembros' | 'coberturaBps'>, modo: Modo, posicion: number): bigint {
  return garantiaAlCobrar(modo) || !tieneTurno(posicion)
    ? colateralDeTurno(p, p.nMiembros - 1)
    : colateralDeTurno(p, posicion)
}

export type FilaTurno = {
  /** 0 cobra en la ronda 1. */
  turno: number
  /** Garantía total del turno (la de siempre). */
  garantia: bigint
  /** Lo que se deja al unirse. */
  alUnirse: bigint
  /** Lo que se aparta de la bolsa al cobrar para completar la garantía. */
  apartado: bigint
  /** > 0: se descuenta de su bolsa. < 0: se le suma. */
  prima: bigint
  /** Efectivo que recibe al cobrar si todos pagan (en la subasta, sin contar su descuento). */
  recibe: bigint
  /** Este turno pide historial (los primeros, si el creador lo eligió). */
  pideHistorial: boolean
}

/** Una fila por turno: cuánto se deja, cuánto se aparta, la prima y cuánto se recibe. */
export function vistaPrevia(p: ParametrosTanda, o: OpcionesForm): FilaTurno[] {
  const b = bolsa(p)
  const primaBps = o.modo === 'PrecioPorTurno' ? Math.round(o.primaPct * 100) : 0
  return Array.from({ length: p.nMiembros }, (_, i) => {
    const garantia = colateralDeTurno(p, i)
    const alUnirse = garantiaAlUnirse(p, o.modo, i)
    const apartado = garantia - alUnirse
    const prima = primaBps > 0 ? primaDeTurno(p, primaBps, i) : 0n
    const historial = conHistorial(o) && i < o.primeros
    return { turno: i, garantia, alUnirse, apartado, prima, recibe: b - prima - apartado, pideHistorial: historial }
  })
}

/** Turnos libres (0 cobra primero) según las posiciones ya tomadas. */
export function turnosLibres(n: number, posiciones: number[]): number[] {
  return Array.from({ length: n }, (_, i) => i).filter((i) => !posiciones.includes(i))
}

type MiembroTurno = { direccion: string; posicion: number; cobro: boolean; moroso: boolean }

/** ¿Puede cambiar su turno? Igual que `intercambiable` del contrato: turno futuro y al día. */
export function intercambiable(m: Omit<MiembroTurno, 'direccion'>, rondaActual: number): boolean {
  return tieneTurno(m.posicion) && m.posicion > rondaActual && !m.cobro && !m.moroso
}

/** Subasta: quién cobra si nadie oferta (el primero del orden de respaldo sin turno y al día). */
export function siguienteDelRespaldo(respaldo: string[], miembros: MiembroTurno[]): string | null {
  for (const dir of respaldo) {
    const m = miembros.find((x) => x.direccion === dir)
    if (m && !tieneTurno(m.posicion) && !m.moroso) return dir
  }
  return null
}

/** Descuento en dinero: bolsa × bps / 100 %. */
export function descuentoDe(b: bigint, bps: number): bigint {
  return (b * BigInt(bps)) / BPS
}

/** Puntos básicos a partir de un porcentaje escrito por la persona ("8,5" -> 850). null si no es válido. */
export function bpsDesdeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.').replace('%', '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null
  return Math.round(Number(limpio) * 100)
}
