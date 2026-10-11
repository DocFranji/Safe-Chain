// Mis tandas abiertas con lugar libre (pedido 6 del plan v5): para elegir a cuál invitar a un amigo. Se lee solo
// cuando la persona lo pide (como "Mis deudas"): las tandas más recientes, pocas a la vez.
import { leerResumen, leerTotal, type ResumenTanda } from './lectura'

export const TANDAS_REVISADAS = 30
const CONCURRENCIA = 4

/** ¿Está abierta, es de `yo` (la creó o está en ella) y todavía tiene lugares libres? Lógica pura, con prueba. */
export function esMiTandaConLugar(r: Pick<ResumenTanda, 'tanda' | 'miembros'>, yo: string): boolean {
  const mia = r.tanda.creador === yo || r.miembros.some((m) => m.direccion === yo)
  return mia && r.tanda.estado.tag === 'Abierta' && r.miembros.length < r.tanda.n_miembros
}

export async function leerMisTandasAbiertas(yo: string): Promise<ResumenTanda[]> {
  const total = await leerTotal()
  const ids: number[] = []
  for (let id = total; id >= 1 && ids.length < TANDAS_REVISADAS; id--) ids.push(id)
  const encontradas: ResumenTanda[] = []
  let i = 0
  async function trabajador() {
    while (i < ids.length) {
      const id = ids[i++]
      try {
        const r = await leerResumen(id)
        if (esMiTandaConLugar(r, yo)) encontradas.push(r)
      } catch {
        // Una tanda que no se pudo leer no impide ver las demás.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, ids.length) }, trabajador))
  return encontradas.sort((a, b) => b.id - a.id)
}
