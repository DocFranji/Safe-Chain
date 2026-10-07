// "Mis deudas" (misión M2, N4 + N2): las tandas donde una dirección debe algo, también las ya terminadas.
// Con una deuda abierta no se puede unir a otra tanda hasta pagarla (error 65), así que el Perfil las
// lista con un botón para pagar. El contrato no tiene "listar", así que se recorren las tandas más
// recientes (como el lobby), pocas a la vez.
import type { Tanda } from 'tanda'
import { leerResumen, leerTotal } from './lectura'

export type MiDeuda = { id: number; tanda: Tanda; deuda: bigint }

/** Cuántas tandas recientes se revisan como máximo. */
export const MAX_TANDAS_REVISADAS = 100
const CONCURRENCIA = 4

/** De una lista de miembros, la deuda de `yo` (0 si no está o no debe). Lógica pura, con prueba. */
export function deudaDe(miembros: { direccion: string; deuda: bigint }[], yo: string): bigint {
  return miembros.find((m) => m.direccion === yo)?.deuda ?? 0n
}

export async function leerMisDeudas(yo: string): Promise<MiDeuda[]> {
  const total = await leerTotal()
  const ids: number[] = []
  for (let id = total; id >= 1 && ids.length < MAX_TANDAS_REVISADAS; id--) ids.push(id)
  const encontradas: MiDeuda[] = []
  let i = 0
  async function trabajador() {
    while (i < ids.length) {
      const id = ids[i++]
      try {
        const r = await leerResumen(id)
        const deuda = deudaDe(r.miembros, yo)
        if (deuda > 0n) encontradas.push({ id, tanda: r.tanda, deuda })
      } catch {
        // Una tanda que no se pudo leer no impide ver las demás.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, ids.length) }, trabajador))
  return encontradas.sort((a, b) => b.id - a.id)
}
