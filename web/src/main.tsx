import './polyfills' // debe ir primero: prepara Buffer para el SDK de Stellar
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes servidas desde el propio sitio (no dependen de Google Fonts).
import '@fontsource/bungee/latin-400.css'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import './index.css'
import App from './App.tsx'
import { SelectorTema } from './components/SelectorTema'
import { iniciarTema } from './lib/tema'
import { SesionGooglePrivy } from './cuentas/SesionGooglePrivy'
import { PRIVY_APP_ID } from './config'

iniciarTema()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SelectorTema />
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
