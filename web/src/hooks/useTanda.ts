// Lee el estado de una tanda desde la red y lo vuelve a leer cada pocos segundos.
import { useCallback, useEffect, useState } from 'react'
import type { Miembro, Tanda } from 'tanda'
import { clienteLectura, leer, traducirError } from '../lib/contrato'
import { INTERVALO_LECTURA_MS } from '../config'

export type MiembroConDireccion = Miembro & { direccion: string }

export type DatosTanda = {
  tanda: Tanda
  /** Ordenados por turno (posicion 0 cobra primero). */
  miembros: MiembroConDireccion[]
  /** Direcciones que ya pagaron la ronda actual. */
  pagaron: string[]
  /** Momento (segundos Unix) en que vence la ronda actual. */
  vence: number
  /** Garantía que pagaría la próxima persona en unirse (solo si la tanda está abierta). */
  colateralSiguiente: bigint | null
}

type Lectura = { id: number; datos: DatosTanda | null; error: string | null }

export function useTanda(id: number | null) {
  // Guardamos a qué tanda corresponde cada lectura, para no mostrar datos viejos al cambiar de tanda.
  const [lectura, setLectura] = useState<Lectura | null>(null)

  const recargar = useCallback(async () => {
    if (id === null) return
    try {
      const c = clienteLectura()
      const [tanda, lista, ronda] = await Promise.all([
        c.get_tanda({ id }).then(leer),
        c.get_miembros({ id }).then(leer),
        c.get_ronda({ id }).then(leer),
      ])
      let colateralSiguiente: bigint | null = null
      if (tanda.estado.tag === 'Abierta' && lista.length < tanda.n_miembros) {
        colateralSiguiente = await c.colateral_siguiente({ id }).then(leer)
      }
      const miembros = lista
        .map(([direccion, m]) => ({ ...m, direccion }))
        .sort((a, b) => a.posicion - b.posicion)
      setLectura({
        id,
        datos: { tanda, miembros, pagaron: ronda[2], vence: Number(ronda[1]), colateralSiguiente },
        error: null,
      })
    } catch (e) {
      // Si falla una relectura, dejamos los últimos datos buenos y mostramos el error.
      setLectura((prev) => ({ id, datos: prev?.id === id ? prev.datos : null, error: traducirError(e) }))
    }
  }, [id])

  useEffect(() => {
    const primera = setTimeout(recargar, 0)
    const t = setInterval(recargar, INTERVALO_LECTURA_MS)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [recargar])

  const vigente = lectura !== null && lectura.id === id ? lectura : null
  return {
    datos: vigente?.datos ?? null,
    error: vigente?.error ?? null,
    cargando: id !== null && vigente === null,
    recargar,
  }
}

/** Cuántas tandas existen (los números van de 1 a este valor). */
export function useTotalTandas() {
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      const tx = await clienteLectura().total_tandas()
      setTotal(tx.result)
      setError(null)
    } catch (e) {
      setError(traducirError(e))
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(recargar, 0)
    return () => clearTimeout(t)
  }, [recargar])

  return { total, error, recargar }
}

/** Segundos Unix actuales, actualizados cada segundo (para la cuenta regresiva). */
export function useAhora(): number {
  const [ahora, setAhora] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setAhora(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  return ahora
}
