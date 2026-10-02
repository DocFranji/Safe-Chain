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

/** 83 -> "1 min 23 s" */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return s % 60 ? `${min} min ${s % 60} s` : `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} días`
}
