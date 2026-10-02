// Lee el estado de una tanda desde la red y lo vuelve a leer cada pocos segundos.
import { useCallback, useEffect, useState } from 'react'
import { traducirError } from '../lib/contrato'
import { leerTandaCompleta, type DatosTanda } from '../lib/lectura'
import { INTERVALO_LECTURA_MS } from '../config'

export type { DatosTanda, MiembroConDireccion } from '../lib/lectura'

type Lectura = { id: number; datos: DatosTanda | null; error: string | null }

export function useTanda(id: number | null) {
  // Guardamos a qué tanda corresponde cada lectura, para no mostrar datos viejos al cambiar de tanda.
  const [lectura, setLectura] = useState<Lectura | null>(null)

  const recargar = useCallback(async () => {
    if (id === null) return
    try {
      const datos = await leerTandaCompleta(id)
      setLectura({ id, datos, error: null })
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

/** Segundos Unix actuales, actualizados cada segundo (para la cuenta regresiva). */
export function useAhora(): number {
  const [ahora, setAhora] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setAhora(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  return ahora
}
