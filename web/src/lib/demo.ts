// Lógica de la vista "Demo en vivo" (pura: se prueba sin navegador).
import type { ResumenTanda } from './lectura'

/**
 * Qué tanda proyectar cuando nadie fijó una (#/demo sin número):
 * la más reciente en curso; si no hay, la abierta más reciente; si no, la última de todas.
 * Así, si el jurado crea tandas nuevas mientras el equipo corre la suya, la pantalla no salta.
 */
export function elegirTanda(lista: Pick<ResumenTanda, 'id' | 'tanda'>[]): number | null {
  const masNueva = (cumple: (r: Pick<ResumenTanda, 'id' | 'tanda'>) => boolean) =>
    lista.filter(cumple).reduce<number | null>((mejor, r) => (mejor === null || r.id > mejor ? r.id : mejor), null)
  const enCurso = (r: Pick<ResumenTanda, 'id' | 'tanda'>) => r.tanda.estado.tag === 'Activa' || r.tanda.estado.tag === 'PorLiquidar'
  const abierta = (r: Pick<ResumenTanda, 'id' | 'tanda'>) => r.tanda.estado.tag === 'Abierta'
  return masNueva(enCurso) ?? masNueva(abierta) ?? masNueva(() => true)
}

/** 83 -> "1:23" (para la cuenta regresiva grande). */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Fracción (0 a 1) de la garantía inicial que todavía le queda a alguien. */
export function fraccionGarantia(restante: bigint, inicial: bigint): number {
  if (inicial <= 0n) return 0
  const f = Number((restante * 1000n) / inicial) / 1000
  return Math.min(1, Math.max(0, f))
}
