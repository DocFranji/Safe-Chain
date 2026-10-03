// Conexión con Freighter.
// Vigila cambios: si en la demo cambian de cuenta (de Ana a Beto) en Freighter,
// la página se entera sola en un par de segundos.
import { useCallback, useEffect, useState } from 'react'
import { WatchWalletChanges, getAddress, getNetwork, isConnected, requestAccess } from '@stellar/freighter-api'
import { NETWORK_PASSPHRASE } from '../config'

export type Billetera = {
  /** Dirección G... de la cuenta activa en Freighter, o null si no está conectada. */
  direccion: string | null
  /** false si Freighter no está instalado en este navegador (solo es confiable cuando `comprobada` es true). */
  instalada: boolean
  /** false hasta que Freighter respondió (o dejó de responder) a la primera consulta: tarda hasta 2 s. */
  comprobada: boolean
  /** false si Freighter está en otra red (por ejemplo, Mainnet). */
  redCorrecta: boolean
  error: string | null
  conectar: () => Promise<void>
}

export function useBilletera(): Billetera {
  const [direccion, setDireccion] = useState<string | null>(null)
  const [instalada, setInstalada] = useState(true)
  const [comprobada, setComprobada] = useState(false)
  const [redCorrecta, setRedCorrecta] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Al abrir la página: si ya habían dado permiso antes, se conecta sin preguntar.
  useEffect(() => {
    let activo = true
    ;(async () => {
      const c = await isConnected()
      if (!activo) return
      setComprobada(true)
      if (c.error || !c.isConnected) {
        setInstalada(false)
        return
      }
      const [a, n] = await Promise.all([getAddress(), getNetwork()])
      if (!activo) return
      if (!a.error && a.address) setDireccion(a.address)
      if (!n.error) setRedCorrecta(n.networkPassphrase === NETWORK_PASSPHRASE)
    })()

    const vigilante = new WatchWalletChanges(2000)
    vigilante.watch(({ address, networkPassphrase, error }) => {
      if (error) return
      setDireccion(address || null)
      setRedCorrecta(networkPassphrase === NETWORK_PASSPHRASE)
    })
    return () => {
      activo = false
      vigilante.stop()
    }
  }, [])

  const conectar = useCallback(async () => {
    setError(null)
    const c = await isConnected()
    setComprobada(true)
    if (c.error || !c.isConnected) {
      setInstalada(false)
      setError('No encontramos Freighter. Instálala desde freighter.app y recarga la página.')
      return
    }
    const r = await requestAccess()
    if (r.error || !r.address) {
      setError('No se pudo conectar. Abre Freighter, desbloquéala e intenta de nuevo.')
      return
    }
    setDireccion(r.address)
    const n = await getNetwork()
    if (!n.error) setRedCorrecta(n.networkPassphrase === NETWORK_PASSPHRASE)
  }, [])

  return { direccion, instalada, comprobada, redCorrecta, error, conectar }
}
