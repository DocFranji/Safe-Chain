// Los amigos de la cuenta conectada (pedido 6 del plan v5), con lo que se guarda en el navegador
// (lib/amigos.ts). Todos los componentes que lo usan ven el cambio al instante, también si se agrega un amigo
// desde otra pestaña (el evento `storage` solo avisa a las demás pestañas, así que dentro de la misma se avisa a mano).
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { almacenLocal } from '../lib/almacen'
import { amigosDeTexto, apodoDeAmigo, claveAmigos, conAmigo, guardarAmigos, leerAmigos, sinAmigo, type Amigo } from '../lib/amigos'

const CAMBIO = 'rounda:amigos'

function suscribir(avisar: () => void) {
  window.addEventListener('storage', avisar)
  window.addEventListener(CAMBIO, avisar)
  return () => {
    window.removeEventListener('storage', avisar)
    window.removeEventListener(CAMBIO, avisar)
  }
}

export function useAmigos(yo: string | null) {
  // Lo guardado, tal cual: un texto, para que React note si cambió sin comparar listas.
  const crudo = useSyncExternalStore(suscribir, () => {
    try {
      return yo ? (almacenLocal()?.getItem(claveAmigos(yo)) ?? '') : ''
    } catch {
      return ''
    }
  })
  const amigos = useMemo(() => amigosDeTexto(crudo), [crudo])

  /** Guarda al amigo. Devuelve false si el navegador no deja guardar (por ejemplo, en una ventana privada). */
  const agregar = useCallback(
    (nuevo: Amigo): boolean => {
      if (!yo) return false
      const guardado = guardarAmigos(almacenLocal(), yo, conAmigo(leerAmigos(almacenLocal(), yo), nuevo))
      window.dispatchEvent(new Event(CAMBIO))
      return guardado
    },
    [yo],
  )

  const quitar = useCallback(
    (dir: string) => {
      if (!yo) return
      guardarAmigos(almacenLocal(), yo, sinAmigo(leerAmigos(almacenLocal(), yo), dir))
      window.dispatchEvent(new Event(CAMBIO))
    },
    [yo],
  )

  return { amigos, agregar, quitar, apodoDe: (dir: string) => apodoDeAmigo(amigos, dir) }
}
