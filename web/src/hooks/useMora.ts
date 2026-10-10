// Quién del grupo tiene un pago pendiente en otra tanda (pedido 4 del plan v5).
//
// Se lee del historial público: un pago pendiente es tener más veces en mora que deudas saldadas
// (`tieneMoraPendiente`, lo mismo que responde `tiene_mora` del contrato). Usa la misma caché de 30 s que las
// insignias de reputación (`historialCacheado`), así que no suma consultas. La página de la tanda lo pone en el
// contexto y lo leen el aviso rojo y la lista de miembros; la lista de tandas también puede usar `useConMora`
// con las personas de cada tarjeta. El botón de unirse no depende del contexto: pregunta en el momento de pulsar
// (`conPagoPendienteAhora`), para no dejar pasar a quien toque el botón antes de que termine la primera lectura.
import { createContext, useContext, useEffect, useState } from 'react'
import { tieneMoraPendiente } from '../lib/historial'
import { historialCacheado } from './useHistorial'

const SIN_NADIE: ReadonlySet<string> = new Set()
/** Cada cuánto se vuelve a preguntar (alguien puede pagar su deuda mientras la página está abierta). */
const REVISAR_CADA_MS = 30_000

export const MoraContexto = createContext<ReadonlySet<string>>(SIN_NADIE)

/** Las personas de la tanda que se está viendo con un pago pendiente en otra tanda (vacío si no se sabe). */
export function usePagosPendientes(): ReadonlySet<string> {
  return useContext(MoraContexto)
}

/**
 * Lee el historial de cada dirección y anota en `sabido` si tiene un pago pendiente. Si no hay contrato de
 * historial, cuenta como que no. Una lectura que falla no anota nada: el aviso solo se da con un dato claro.
 */
async function leerMora(direcciones: string[], forzar: boolean, sabido: Map<string, boolean>): Promise<void> {
  await Promise.all(
    direcciones.map(async (dir) => {
      try {
        const h = await historialCacheado(dir, forzar)
        sabido.set(dir, h !== null && tieneMoraPendiente(h))
      } catch {
        // Se queda lo último que se supo de esta persona.
      }
    }),
  )
}

/** De estas direcciones, las que tienen un pago pendiente ahora mismo (con la caché de 30 s), en el mismo orden. */
export async function conPagoPendienteAhora(direcciones: string[]): Promise<string[]> {
  const sabido = new Map<string, boolean>()
  await leerMora(direcciones, false, sabido)
  return direcciones.filter((dir) => sabido.get(dir))
}

const igual = (a: ReadonlySet<string>, b: readonly string[]) => a.size === b.length && b.every((x) => a.has(x))

/**
 * De estas direcciones, cuáles tienen un pago pendiente. Se vuelve a preguntar cada 30 s mientras la página se ve
 * y, si una lectura falla, se conserva lo último que se leyó de esa persona.
 */
export function useConMora(direcciones: string[]): ReadonlySet<string> {
  // El efecto depende del texto, no de la lista: la lista es nueva en cada dibujo.
  const clave = [...new Set(direcciones)].sort().join(',')
  const [con, setCon] = useState<ReadonlySet<string>>(SIN_NADIE)

  useEffect(() => {
    if (clave === '') return
    const lista = clave.split(',')
    let vivo = true
    const sabido = new Map<string, boolean>()

    async function revisar(forzar: boolean) {
      await leerMora(lista, forzar, sabido)
      if (!vivo) return
      const nuevos = lista.filter((dir) => sabido.get(dir))
      setCon((previo) => (igual(previo, nuevos) ? previo : new Set(nuevos)))
    }

    const primera = setTimeout(() => void revisar(false), 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void revisar(true)
    }, REVISAR_CADA_MS)
    return () => {
      vivo = false
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [clave])

  return clave === '' ? SIN_NADIE : con
}
