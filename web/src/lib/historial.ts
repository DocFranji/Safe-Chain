// Historial crediticio (misión M2): lectura del contrato `historial` y la fórmula del puntaje.
//
// La fórmula vive en el contrato (contracts/historial/src/lib.rs); aquí se repite SOLO para explicarla
// en pantalla (la tabla "Cómo se calcula" y el "te faltan N puntos"). El puntaje y el nivel que se
// muestran siempre vienen del contrato. Diseño: docs/historial.md.
import { Client, type Historial } from 'historial'
import { clienteLectura, leer } from './contrato'
import { HISTORIAL_ID, NETWORK_PASSPHRASE, RPC_URL } from '../config'

export type { Historial }

/** Nombre de cada nivel, en el orden del contrato (enum Nivel: 0..3). */
export const NOMBRES_NIVEL = ['Nuevo', 'Bronce', 'Plata', 'Oro'] as const
export type NombreNivel = (typeof NOMBRES_NIVEL)[number]

/** Puntaje mínimo de cada nivel y descuento de garantía (en %). */
export const NIVELES: { nombre: NombreNivel; desde: number; descuento: number }[] = [
  { nombre: 'Nuevo', desde: 0, descuento: 0 },
  { nombre: 'Bronce', desde: 100, descuento: 10 },
  { nombre: 'Plata', desde: 300, descuento: 25 },
  { nombre: 'Oro', desde: 600, descuento: 50 },
]

/** Puntos de cada hecho (para la tabla "Cómo se calcula"). */
export const REGLAS_PUNTOS: { hecho: string; puntos: number }[] = [
  { hecho: 'Pagar una cuota a tiempo', puntos: 10 },
  { hecho: 'Pagar una cuota tarde', puntos: 3 },
  { hecho: 'Terminar una tanda sin atrasos', puntos: 50 },
  { hecho: 'Terminar una tanda con atrasos', puntos: 25 },
  { hecho: 'Saldar una deuda', puntos: 60 },
  { hecho: 'No pagar y que la garantía cubra la cuota', puntos: -15 },
  { hecho: 'Quedar debiendo (moroso)', puntos: -100 },
]

/** Requisitos de historial de una tanda (los elige quien la crea). */
export type OpcionesDeHistorial = { puntaje_minimo: number; descuento: boolean }
export const SIN_REQUISITOS: OpcionesDeHistorial = { puntaje_minimo: 0, descuento: false }

/** ¿Hay que firmar `configurar_requisitos` después de crear la tanda? */
export const hayRequisitos = (o: OpcionesDeHistorial) => o.puntaje_minimo > 0 || o.descuento

export const TOPE_POR_TANDA = 150
export const CUOTA_MINIMA_TUSD = 10

export function puntajeDe(h: Pick<Historial, 'puntos_positivos' | 'puntos_negativos'>): number {
  return Math.max(0, h.puntos_positivos - h.puntos_negativos)
}

export function nivelDePuntaje(puntaje: number): NombreNivel {
  let nivel: NombreNivel = 'Nuevo'
  for (const n of NIVELES) if (puntaje >= n.desde) nivel = n.nombre
  return nivel
}

/** Mora sin saldar: no da beneficios aunque el puntaje dé nivel (igual que el contrato). */
export function tieneMoraPendiente(h: Pick<Historial, 'veces_moroso' | 'deudas_saldadas'>): boolean {
  return h.veces_moroso > h.deudas_saldadas
}

/** Descuento de garantía en %, igual que `beneficio_colateral_bps` del contrato. */
export function descuentoDe(h: Historial): number {
  if (tieneMoraPendiente(h)) return 0
  const nivel = nivelDePuntaje(puntajeDe(h))
  return NIVELES.find((n) => n.nombre === nivel)!.descuento
}

/** Próximo nivel y cuántos puntos faltan (null si ya es Oro). */
export function siguienteNivel(puntaje: number): { nombre: NombreNivel; faltan: number } | null {
  const sig = NIVELES.find((n) => n.desde > puntaje)
  return sig ? { nombre: sig.nombre, faltan: sig.desde - puntaje } : null
}

export function sinHistorial(h: Historial): boolean {
  return h.primera_actividad === 0n
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Desglose en frases cortas ("12 cuotas a tiempo", "1 vez en mora"...). Solo lo que no es cero. */
export function desglose(h: Historial): string[] {
  const lineas: [number, string, string][] = [
    [h.cuotas_a_tiempo, 'cuota pagada a tiempo', 'cuotas pagadas a tiempo'],
    [h.cuotas_tarde, 'cuota pagada tarde', 'cuotas pagadas tarde'],
    [h.tandas_cumplidas, 'tanda terminada sin atrasos', 'tandas terminadas sin atrasos'],
    [h.tandas_con_atrasos, 'tanda terminada con atrasos', 'tandas terminadas con atrasos'],
    [h.cobros, 'bolsa recibida', 'bolsas recibidas'],
    [h.cuotas_cubiertas, 'cuota cubierta por su garantía', 'cuotas cubiertas por su garantía'],
    [h.veces_moroso, 'vez en mora', 'veces en mora'],
    [h.deudas_saldadas, 'deuda saldada', 'deudas saldadas'],
  ]
  return lineas.filter(([n]) => n > 0).map(([n, uno, varios]) => plural(n, uno, varios))
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

let direccion: Promise<string | null> | null = null

/**
 * Dirección del contrato de historial: VITE_HISTORIAL_ID si está; si no, la que tiene configurada
 * el contrato de la tanda (`get_historial`). null si no hay (por ejemplo, un contrato de tanda
 * anterior a M2): entonces la web esconde todo lo del historial.
 */
export function direccionHistorial(): Promise<string | null> {
  if (HISTORIAL_ID) return Promise.resolve(HISTORIAL_ID)
  if (!direccion) {
    direccion = clienteLectura()
      .get_historial()
      .then((tx) => {
        const valor: unknown = tx.result
        return typeof valor === 'string' && valor.startsWith('C') ? valor : null
      })
      .catch(() => {
        direccion = null // se reintenta en la próxima lectura
        return null
      })
  }
  return direccion
}

export function clienteHistorial(contractId: string): Client {
  return new Client({ contractId, networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL })
}

/** Historial de `dir` (todo en cero si no tiene). null si no hay contrato de historial. */
export async function leerHistorial(dir: string): Promise<Historial | null> {
  const id = await direccionHistorial()
  if (!id) return null
  const tx = await clienteHistorial(id).historial({ dir })
  return tx.result
}

/** Una dirección de Stellar con forma válida (G... o C..., 56 caracteres). */
export function esDireccion(texto: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(texto)
}

/** Requisitos de historial de una tanda. Con un contrato anterior a M2: ninguno. */
export async function leerRequisitos(id: number): Promise<{ puntaje_minimo: number; descuento: boolean }> {
  try {
    return await clienteLectura().get_requisitos({ id }).then(leer)
  } catch {
    return { puntaje_minimo: 0, descuento: false }
  }
}
