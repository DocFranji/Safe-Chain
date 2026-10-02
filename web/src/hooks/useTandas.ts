// Lista de tandas para el lobby.
// El contrato no tiene "listar", solo un contador (`total_tandas`), así que leemos
// los ids del más nuevo hacia atrás, por lotes, y refrescamos cada pocos segundos.
import { useCallback, useEffect, useRef, useState } from 'react'
import { traducirError } from '../lib/contrato'
import { esTerminal, leerResumen, leerTotal, type ResumenTanda } from '../lib/lectura'

const POR_PAGINA = 12
const INTERVALO_LOBBY_MS = 15_000
const CONCURRENCIA = 4

// Una tanda terminada o cancelada ya no cambia: la guardamos y no la volvemos a pedir.
const terminales = new Map<number, ResumenTanda>()

/** Corre `fn` sobre cada elemento, pero solo `limite` a la vez (para no saturar el RPC público). */
async function conLimite<T, R>(items: T[], limite: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const salida: PromiseSettledResult<R>[] = new Array(items.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++
      try {
        salida[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        salida[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador))
  return salida
}

type Estado = { total: number | null; lista: ResumenTanda[]; error: string | null; listo: boolean }

export function useTandas() {
  const [estado, setEstado] = useState<Estado>({ total: null, lista: [], error: null, listo: false })
  const [cuantas, setCuantas] = useState(POR_PAGINA)
  const ultimas = useRef(new Map<number, ResumenTanda>())

  const recargar = useCallback(async () => {
    try {
      const total = await leerTotal()
      const desde = Math.max(1, total - cuantas + 1)
      const ids: number[] = []
      for (let id = total; id >= desde; id--) ids.push(id)

      const pedir = ids.filter((id) => !terminales.has(id))
      const resultados = await conLimite(pedir, CONCURRENCIA, leerResumen)
      let fallos = 0
      resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          ultimas.current.set(r.value.id, r.value)
          if (esTerminal(r.value.tanda.estado.tag)) terminales.set(r.value.id, r.value)
        } else {
          fallos++
          console.warn(`No se pudo leer la tanda ${pedir[i]}`, r.reason)
        }
      })

      // Si una lectura falla, mostramos la última versión buena de esa tanda.
      const lista = ids
        .map((id) => terminales.get(id) ?? ultimas.current.get(id))
        .filter((r): r is ResumenTanda => r !== undefined)
      const error = fallos > 0 && lista.length === 0 ? 'No pudimos leer las tandas. Intenta de nuevo en unos segundos.' : null
      setEstado({ total, lista, error, listo: true })
    } catch (e) {
      setEstado((prev) => ({ ...prev, error: traducirError(e), listo: true }))
    }
  }, [cuantas])

  useEffect(() => {
    const primera = setTimeout(recargar, 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar()
    }, INTERVALO_LOBBY_MS)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [recargar])

  const hayMas = estado.total !== null && estado.total > cuantas
  const verMas = useCallback(() => setCuantas((c) => c + POR_PAGINA), [])

  return { ...estado, hayMas, verMas, recargar }
}
