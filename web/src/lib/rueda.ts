// El modelo de la rueda de la tanda (sin dibujo): quién ocupa cada asiento, en qué estado está y cuánto gira.
// Lo usan los dos dibujos de components/Rueda.tsx (la carreta y el anillo).
import type { DatosTanda, MiembroConDireccion } from './lectura'
import { nombreDe } from './nombres'
import { tieneTurno } from './turnos'

export type Asiento = {
  i: number
  miembro: MiembroConDireccion | null
  nombre: string
  /** El número de turno, o "?" si todavía no lo tiene (sorteo antes de llenarse, subasta). */
  numero: string
  pago: boolean
  cobro: boolean
  moroso: boolean
  yo: boolean
  turno: boolean
  /** Índice del color de la carreta (0 rojo, 1 amarillo, 2 azul, 3 verde): nunca igual al de sus vecinos. */
  color: number
}

export type ModeloRueda = {
  n: number
  asientos: Asiento[]
  activa: boolean
  vencida: boolean
  restante: number
  /** De 1 (recién empezó la ronda) a 0 (venció). */
  fraccionRestante: number
  /** Grados que gira la rueda para dejar arriba a quien cobra esta ronda (negativo: sentido contrario al reloj). */
  giro: number
  beneficiario: MiembroConDireccion | null
}

/** Colores para n asientos en círculo, sin dos vecinos iguales (tampoco el último con el primero). */
export function coloresSinRepetir(n: number, k = 4): number[] {
  const c = Array.from({ length: n }, (_, i) => i % k)
  if (n > 1 && c[n - 1] === c[0]) {
    const prohibidos = new Set([c[n - 2], c[0]])
    c[n - 1] = [...Array(k).keys()].find((x) => !prohibidos.has(x)) ?? c[n - 1]
  }
  return c
}

export function armarRueda(datos: DatosTanda, ahora: number, yo: string | null): ModeloRueda {
  const { tanda, miembros, pagaron, vence } = datos
  const n = tanda.n_miembros
  const estado = tanda.estado.tag
  const activa = estado === 'Activa'

  // (M3) Quien todavía no tiene turno ocupa un asiento libre, marcado con "?".
  const sinTurno = miembros.filter((m) => !tieneTurno(m.posicion))
  let k = 0
  const ocupantes: (MiembroConDireccion | null)[] = Array.from(
    { length: n },
    (_, i) => miembros.find((m) => m.posicion === i) ?? sinTurno[k++] ?? null,
  )
  // En la subasta, quien cobra la ronda no se sabe hasta cerrarla: el asiento puede ser de alguien sin turno.
  const enTurno = activa ? ocupantes[tanda.ronda_actual] : null
  const beneficiario = enTurno != null && enTurno.posicion === tanda.ronda_actual ? enTurno : null

  const colores = coloresSinRepetir(n)
  const asientos = ocupantes.map((m, i): Asiento => ({
    i,
    miembro: m,
    nombre: m === null ? 'Libre' : m.direccion === yo ? `${nombreDe(m.direccion)} (tú)` : nombreDe(m.direccion),
    numero: m !== null && !tieneTurno(m.posicion) ? '?' : String(i + 1),
    pago: m !== null && pagaron.includes(m.direccion),
    cobro: !!m?.cobro,
    moroso: !!m?.moroso,
    yo: m !== null && m.direccion === yo,
    turno: beneficiario !== null && i === tanda.ronda_actual,
    color: colores[i],
  }))

  const periodo = Number(tanda.periodo_seg)
  const restante = vence - ahora
  const ronda = estado === 'Abierta' || estado === 'Cancelada' ? 0 : Math.min(tanda.ronda_actual, n - 1)
  return {
    n,
    asientos,
    activa,
    vencida: activa && restante <= 0,
    restante,
    fraccionRestante: activa && periodo > 0 ? Math.min(1, Math.max(0, restante / periodo)) : 0,
    giro: -(ronda * 360) / n,
    beneficiario,
  }
}
