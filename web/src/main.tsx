import './polyfills' // debe ir primero: prepara Buffer para el SDK de Stellar
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes servidas desde el propio sitio (no dependen de Google Fonts).
import '@fontsource-variable/archivo/wdth.css' // Sarchí: ancho y peso variables
import '@fontsource-variable/bricolage-grotesque/wght.css' // Montaña: títulos
import '@fontsource-variable/geist/wght.css' // Montaña: texto y números
import './index.css'
import App from './App.tsx'
import { SelectorTema } from './components/SelectorTema'
import { iniciarTema, letrasListas } from './lib/tema'
import { SesionGooglePrivy } from './cuentas/SesionGooglePrivy'
import { PRIVY_APP_ID } from './config'

iniciarTema()

// Se dibuja cuando llegan las letras del tema (o a los 400 ms, lo que pase primero): evita que el texto salte.
void letrasListas().then(() =>
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
  ),
)
