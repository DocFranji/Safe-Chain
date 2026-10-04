import { DECIMALES } from '../config'

const UNIDAD = 10n ** DECIMALES

/** 1_000_000_000n -> "100"   |   112_712_316n -> "11,27" */
export function monto(valor: bigint): string {
  const negativo = valor < 0n
  const abs = negativo ? -valor : valor
  const entero = Number(abs / UNIDAD).toLocaleString('es-CR')
  const centavos = Number(((abs % UNIDAD) * 100n) / UNIDAD)
  const texto = centavos > 0 ? `${entero},${String(centavos).padStart(2, '0')}` : entero
  return negativo ? `−${texto}` : texto
}

/** Puntos básicos a porcentaje: 1000 -> "10 %" */
export function porcentaje(bps: number): string {
  const valor = bps / 100
  return `${Number.isInteger(valor) ? valor : valor.toFixed(1)} %`
}

/** El estado del contrato, en palabras de la gente. */
export function etiquetaEstado(tag: string): string {
  switch (tag) {
    case 'Abierta':
      return 'Abierta'
    case 'Activa':
      return 'En curso'
    case 'PorLiquidar':
      return 'Por repartir'
    case 'Finalizada':
      return 'Terminada'
    case 'Cancelada':
      return 'Cancelada'
    default:
      return tag
  }
}

/** Clase CSS de la etiqueta de estado (.etiqueta.abierta, .en-curso, ...). */
export function claseEstado(tag: string): string {
  switch (tag) {
    case 'Abierta':
      return 'abierta'
    case 'Activa':
      return 'en-curso'
    case 'PorLiquidar':
      return 'por-repartir'
    case 'Finalizada':
      return 'terminada'
    default:
      return 'cancelada'
  }
}

const DIA = 86_400
const SEMANA = 7 * DIA
/** En toda la app, 1 mes = 30 días. */
const MES = 30 * DIA

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** 83 -> "1 min 23 s"   |   604 800 -> "1 semana"   |   31 104 000 -> "12 meses"   |   3 888 000 -> "45 días" */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return s % 60 ? `${min} min ${s % 60} s` : `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  if (s % MES === 0) return plural(s / MES, 'mes', 'meses')
  if (s % SEMANA === 0) return plural(s / SEMANA, 'semana', 'semanas')
  return `${Math.floor(h / 24)} días`
}

// ---------------------------------------------------------------------------
// Fechas (en la zona horaria de quien mira; `zona` solo para las pruebas)
// ---------------------------------------------------------------------------

function partes(segundosUnix: number, opciones: Intl.DateTimeFormatOptions, zona?: string) {
  const f = new Intl.DateTimeFormat('es-CR', { ...opciones, timeZone: zona })
  const p: Record<string, string> = {}
  for (const { type, value } of f.formatToParts(new Date(segundosUnix * 1000))) p[type] = value
  return p
}

/** "martes 3 de noviembre" (y el año si no es el de `referencia`). */
export function fechaLarga(segundosUnix: number, referencia = segundosUnix, zona?: string): string {
  const p = partes(segundosUnix, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, zona)
  const anioRef = partes(referencia, { year: 'numeric' }, zona).year
  return `${p.weekday} ${p.day} de ${p.month}${p.year !== anioRef ? ` de ${p.year}` : ''}`
}

/** "3:45 p. m." */
export function hora(segundosUnix: number, zona?: string): string {
  return new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit', timeZone: zona })
    .format(new Date(segundosUnix * 1000))
    .replace(/\u202f|\u00a0/g, ' ')
}

function mismoDia(a: number, b: number, zona?: string): boolean {
  const o: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' }
  const pa = partes(a, o, zona)
  const pb = partes(b, o, zona)
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day
}

/**
 * Cuándo es `momento`, visto desde `ahora`, para frases como "Vence ___":
 * "hoy a las 3:45 p. m." · "mañana a las 9:00 a. m." · "el martes 3 de noviembre".
 */
export function cuando(momento: number, ahora: number, zona?: string): string {
  if (mismoDia(momento, ahora, zona)) return `hoy a las ${hora(momento, zona)}`
  if (mismoDia(momento, ahora + DIA, zona)) return `mañana a las ${hora(momento, zona)}`
  return `el ${fechaLarga(momento, ahora, zona)}`
}
