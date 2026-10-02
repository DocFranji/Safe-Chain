// Lee los eventos de una tanda y los refresca cada pocos segundos.
// Con ellos se arma la línea de tiempo y los resultados finales.
import { useCallback, useEffect, useState } from 'react'
import { leerEventos } from '../lib/rpc'
import type { EventoTanda } from '../lib/historia'

type Lectura = { id: number; eventos: EventoTanda[] }

export function useEventos(id: number | null, intervaloMs = 6000) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [error, setError] = useState(false)

  const recargar = useCallback(async () => {
    if (id === null) return
    try {
      const eventos = await leerEventos(id)
      setLectura({ id, eventos })
      setError(false)
    } catch {
      setError(true)
    }
  }, [id])

  useEffect(() => {
    const primera = setTimeout(recargar, 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar()
    }, intervaloMs)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [recargar, intervaloMs])

  // Si cambian de tanda, no mostramos los eventos de la anterior.
  const vigente = lectura !== null && lectura.id === id ? lectura : null
  return { eventos: vigente?.eventos ?? null, error, recargar }
}
