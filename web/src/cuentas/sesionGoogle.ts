// Estado de "entrar con Google", compartido con toda la app.
// Lo llena <SesionGooglePrivy> (SesionGooglePrivy.tsx). Si no hay VITE_PRIVY_APP_ID, se queda en null
// y la web funciona como antes: solo con Freighter.
import { createContext, useContext } from 'react'

export type SesionGoogle = {
  /** false mientras Privy arranca (tarda un momento al abrir la página). */
  lista: boolean
  /** true con la sesión iniciada, aunque la billetera todavía se esté creando. */
  conectada: boolean
  /** Dirección G... de la billetera Stellar de esta cuenta; null mientras se crea o sin sesión. */
  direccion: string | null
  /** Correo de Google, para mostrar quién entró. */
  correo: string | null
  /** true mientras se crea la billetera Stellar la primera vez que alguien entra. */
  creandoBilletera: boolean
  error: string | null
  entrar: () => void
  salir: () => Promise<void>
}

export const ContextoSesionGoogle = createContext<SesionGoogle | null>(null)

/** null si "entrar con Google" no está configurado en esta versión de la web. */
export function useSesionGoogle(): SesionGoogle | null {
  return useContext(ContextoSesionGoogle)
}
