import './App.css'
import { useBilletera, type Billetera } from './hooks/useBilletera'
import { useRuta } from './hooks/useRuta'
import { useCuenta } from './hooks/useCuenta'
import { Lobby } from './pages/Lobby'
import { CrearTanda } from './pages/CrearTanda'
import { PaginaTanda } from './pages/PaginaTanda'
import { Demo } from './pages/Demo'
import { Estado } from './pages/Estado'
import { Landing } from './landing/Landing'
import { Mensaje } from './components/Mensaje'
import { BarraCuenta } from './components/BarraCuenta'
import { direccionCorta, nombreDe, NOMBRES } from './lib/nombres'
import { RUTA_CREAR, RUTA_DEMO, RUTA_ESTADO, RUTA_INICIO, RUTA_LOBBY } from './lib/rutas'
import { EXPLORADOR, TANDA_ID } from './config'

export default function App() {
  const billetera = useBilletera()
  const ruta = useRuta()
  const cuenta = useCuenta(billetera.direccion, billetera.redCorrecta)

  // La landing trae su propio encabezado y pie: no se le pone el de la app.
  if (ruta.tipo === 'inicio') return <Landing />

  return (
    <div className="app">
      <header className="barra">
        <a className="marca" href={RUTA_INICIO}>
          <span className="logo" aria-hidden="true">
            <span className="logo-orbita" />
          </span>
          Rounda
        </a>
        <nav className="menu" aria-label="Principal">
          <a href={RUTA_LOBBY} aria-current={ruta.tipo === 'lobby' ? 'page' : undefined}>
            Tandas
          </a>
          <a href={RUTA_CREAR} aria-current={ruta.tipo === 'crear' ? 'page' : undefined}>
            Crear
          </a>
          <a href={RUTA_DEMO} aria-current={ruta.tipo === 'demo' ? 'page' : undefined}>
            Demo en vivo
          </a>
        </nav>
        <BotonBilletera billetera={billetera} />
      </header>

      {ruta.tipo !== 'demo' && <BarraCuenta billetera={billetera} cuenta={cuenta} />}

      <main>
        {!TANDA_ID ? (
          <Mensaje titulo="Falta configurar el contrato">
            Crea el archivo <code>web/.env</code> con <code>VITE_TANDA_ID</code> y reinicia <code>npm run dev</code>.
          </Mensaje>
        ) : ruta.tipo === 'lobby' ? (
          <Lobby billetera={billetera} cuenta={cuenta} />
        ) : ruta.tipo === 'crear' ? (
          <CrearTanda billetera={billetera} saldo={cuenta.saldo} />
        ) : ruta.tipo === 'tanda' ? (
          <PaginaTanda key={ruta.id} id={ruta.id} billetera={billetera} saldo={cuenta.saldo} />
        ) : ruta.tipo === 'demo' ? (
          <Demo idFijo={ruta.id} />
        ) : ruta.tipo === 'estado' ? (
          <Estado billetera={billetera} />
        ) : (
          <Mensaje titulo="Esa página no existe">
            <a href={RUTA_LOBBY}>Volver a las tandas</a>
          </Mensaje>
        )}
      </main>

      <footer className="pie">
        Funciona en la red de pruebas de Stellar (testnet), con TUSD de prueba.{' '}
        <a href={RUTA_ESTADO}>Estado del sistema</a>
        {' · '}
        {TANDA_ID && (
          <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
            Ver el contrato en el explorador
          </a>
        )}
      </footer>
    </div>
  )
}

function BotonBilletera({ billetera }: { billetera: Billetera }) {
  if (billetera.direccion) {
    const conocido = NOMBRES[billetera.direccion]
    return (
      <div className="billetera" title={billetera.direccion}>
        <span className={billetera.redCorrecta ? 'punto ok' : 'punto mal'} aria-hidden="true" />
        <span>
          {conocido ? `${nombreDe(billetera.direccion)} ` : ''}
          <span className="dir">{direccionCorta(billetera.direccion)}</span>
        </span>
        {!billetera.redCorrecta && <span className="red-mal">Cambia a Testnet</span>}
      </div>
    )
  }
  if (!billetera.instalada) {
    return (
      <a className="boton chico" href="https://freighter.app" target="_blank" rel="noreferrer">
        Instalar Freighter
      </a>
    )
  }
  return (
    <button className="boton chico" onClick={billetera.conectar}>
      Conectar billetera
    </button>
  )
}
