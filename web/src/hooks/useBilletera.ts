// La billetera con la que la persona usa la app: su cuenta de Google (Privy) o Freighter.
// Si entró con Google, manda esa. Si no, Freighter, como siempre.
// Vigila cambios: si en la demo cambian de cuenta (de Ana a Beto) en Freighter,
// la página se entera sola en un par de segundos.
import { useCallback, useEffect, useState } from 'react'
import { WatchWalletChanges, getAddress, getNetwork, isConnected, requestAccess } from '@stellar/freighter-api'
import { NETWORK_PASSPHRASE } from '../config'
import { useSesionGoogle, type SesionGoogle } from '../cuentas/sesionGoogle'

export type Billetera = {
  /** Dirección G... con la que se firma (la de Google o la de Freighter), o null si no hay ninguna. */
  direccion: string | null
  /** false si Freighter no está instalado en este navegador (solo es confiable cuando `comprobada` es true). */
  instalada: boolean
  /** false hasta que Freighter respondió (o dejó de responder) a la primera consulta: tarda hasta 2 s. */
  comprobada: boolean
  /** false si Freighter está en otra red (por ejemplo, Mainnet). */
  redCorrecta: boolean
  error: string | null
  /** Conecta Freighter. */
  conectar: () => Promise<void>
  /** Con qué entró: 'google', 'freighter' o null si todavía no se conectó. */
  tipo: 'google' | 'freighter' | null
  /** Entrar con Google; null si no está configurado (falta VITE_PRIVY_APP_ID). */
  google: SesionGoogle | null
}

export function useBilletera(): Billetera {
  const google = useSesionGoogle()
  const freighter = useFreighter()

  if (google?.direccion) {
    return {
      ...freighter,
      direccion: google.direccion,
      // La billetera de Google no tiene red: la misma llave sirve en testnet.
      redCorrecta: true,
      error: google.error,
      tipo: 'google',
      google,
    }
  }
  return {
    ...freighter,
    error: google?.error ?? freighter.error,
    tipo: freighter.direccion ? 'freighter' : null,
    google,
  }
}

type Freighter = Omit<Billetera, 'tipo' | 'google'>

function useFreighter(): Freighter {
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
