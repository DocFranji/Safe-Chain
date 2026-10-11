// Reputación y pagos pendientes de la gente de la lista de tandas (pedidos 4 y 5 del plan v5).
// Una lectura del historial por dirección (con la caché de 30 s de useHistorial), de a cuatro a la vez, y otra vuelta
// cada minuto mientras la pestaña está a la vista.
import { useEffect, useState } from 'react'
import { historialCacheado } from './useHistorial'
import { direccionHistorial, nivelDePuntaje, puntajeDe, type Historial, type NombreNivel } from '../lib/historial'
import { direccionesARevisar, pendientesEn } from '../lib/filtros'
import type { ResumenTanda } from '../lib/lectura'

const OTRA_VUELTA_MS = 60_000
const A_LA_VEZ = 4

export type Reputaciones = {
  /** false si el contrato no tiene historial: no hay reputación por la cual filtrar. */
  conHistorial: boolean
  /** Todavía faltan lecturas. */
  revisando: boolean
  nivelDe: (dir: string) => NombreNivel | undefined
  pendientesDe: (r: ResumenTanda) => number
}

export function useReputaciones(lista: ResumenTanda[], conCreadores: boolean): Reputaciones {
  // null = no se pudo leer (no cuenta para nada).
  const [leidos, setLeidos] = useState<ReadonlyMap<string, Historial | null>>(new Map())
  const [conHistorial, setConHistorial] = useState(true)
  const [vuelta, setVuelta] = useState(0)
  const clave = direccionesARevisar(lista, conCreadores).join(',')

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setVuelta((v) => v + 1)
    }, OTRA_VUELTA_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!clave) return
    let vivo = true
    const dirs = clave.split(',')
    void (async () => {
      if (!(await direccionHistorial())) {
        if (vivo) setConHistorial(false)
        return
      }
      const nuevos = new Map<string, Historial | null>()
      let i = 0
      const trabajador = async () => {
        while (vivo && i < dirs.length) {
          const dir = dirs[i++]
          nuevos.set(dir, await historialCacheado(dir).catch(() => null))
        }
      }
      await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, dirs.length) }, trabajador))
      if (vivo) setLeidos((antes) => new Map([...antes, ...nuevos]))
    })()
    return () => {
      vivo = false
    }
  }, [clave, vuelta])

  const dirs = clave ? clave.split(',') : []
  return {
    conHistorial,
    revisando: conHistorial && dirs.some((d) => !leidos.has(d)),
    nivelDe: (dir) => {
      const h = leidos.get(dir)
      return h ? nivelDePuntaje(puntajeDe(h)) : undefined
    },
    pendientesDe: (r) => pendientesEn(r, (dir) => leidos.get(dir)),
  }
}
