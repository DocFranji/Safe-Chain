// "Entrar con Google" con Privy.
//
// Qué pasa cuando alguien entra:
//   1. Privy abre la ventana de Google y crea la sesión.
//   2. Si esa cuenta todavía no tiene billetera Stellar, se la creamos (solo la primera vez).
//   3. Registramos el firmante en lib/firmante.ts: desde ahí, las transacciones de esa dirección
//      las firma Privy en lugar de Freighter. El resto de la app no cambia.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains'
import { PRIVY_APP_ID } from '../config'
import { aHex, deHex, usarFirmantePrivy } from '../lib/firmante'
import { ContextoSesionGoogle, type SesionGoogle } from './sesionGoogle'

export function SesionGooglePrivy({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['google'],
        appearance: { theme: 'dark', accentColor: '#10b981', landingHeader: 'Entra a Rounda' },
      }}
    >
      <Puente>{children}</Puente>
    </PrivyProvider>
  )
}

function Puente({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { createWallet } = useCreateWallet()
  const { signRawHash } = useSignRawHash()
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La que acabamos de crear, por si `user` tarda en actualizarse.
  const [creada, setCreada] = useState<string | null>(null)
  const yaPedida = useRef(false)

  const billetera = user?.linkedAccounts.find((c) => c.type === 'wallet' && c.chainType === 'stellar')
  const direccion = (billetera && 'address' in billetera ? billetera.address : null) ?? (authenticated ? creada : null)
  const correo = user?.google?.email ?? user?.email?.address ?? null

  // Primera vez que entra: crear su billetera Stellar. El ref evita crearla dos veces (React StrictMode).
  useEffect(() => {
    if (!ready || !authenticated || direccion || yaPedida.current) return
    yaPedida.current = true
    void (async () => {
      setCreando(true)
      setError(null)
      try {
        const { wallet } = await createWallet({ chainType: 'stellar' })
        setCreada(wallet.address)
      } catch {
        yaPedida.current = false
        setError('No pudimos crear tu billetera. Sal y vuelve a entrar.')
      } finally {
        setCreando(false)
      }
    })()
  }, [ready, authenticated, direccion, createWallet])

  // Mientras haya sesión con billetera, Privy firma por ella.
  useEffect(() => {
    if (!authenticated || !direccion) {
      usarFirmantePrivy(null)
      return
    }
    usarFirmantePrivy({
      direccion,
      firmarHash: async (dir, hash) => {
        const { signature } = await signRawHash({ address: dir, chainType: 'stellar', hash: aHex(hash) })
        return deHex(signature)
      },
    })
    return () => usarFirmantePrivy(null)
  }, [authenticated, direccion, signRawHash])

  const valor = useMemo<SesionGoogle>(
    () => ({
      lista: ready,
      conectada: ready && authenticated,
      direccion: ready && authenticated ? direccion : null,
      correo: ready && authenticated ? correo : null,
      creandoBilletera: creando,
      error,
      entrar: () => login(),
      salir: async () => {
        yaPedida.current = false
        setCreada(null)
        await logout()
      },
    }),
    [ready, authenticated, direccion, correo, creando, error, login, logout],
  )

  return <ContextoSesionGoogle.Provider value={valor}>{children}</ContextoSesionGoogle.Provider>
}
