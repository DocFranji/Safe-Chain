import './polyfills' // debe ir primero: prepara Buffer para el SDK de Stellar
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes servidas desde el propio sitio (no dependen de Google Fonts).
import '@fontsource-variable/geist/wght.css' // la letra de la marca, en todo
import './index.css'
import App from './App.tsx'
import { iniciarApariencia, letrasListas } from './lib/apariencia'
import { SesionGooglePrivy } from './cuentas/SesionGooglePrivy'
import { PRIVY_APP_ID } from './config'

iniciarApariencia()

// Se dibuja cuando llegan las letras de la marca (o a los 400 ms, lo que pase primero): evita que el texto salte.
void letrasListas().then(() =>
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
  ),
)
