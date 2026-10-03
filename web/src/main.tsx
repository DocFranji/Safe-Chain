import './polyfills' // debe ir primero: prepara Buffer para el SDK de Stellar
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SesionGooglePrivy } from './cuentas/SesionGooglePrivy'
import { PRIVY_APP_ID } from './config'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sin VITE_PRIVY_APP_ID no se carga Privy: la web funciona solo con Freighter, como antes. */}
    {PRIVY_APP_ID ? (
      <SesionGooglePrivy>
        <App />
      </SesionGooglePrivy>
    ) : (
      <App />
    )}
  </StrictMode>,
)
