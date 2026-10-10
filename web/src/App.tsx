import './App.css'
import './movimiento.css'
import './temas.css'
import './paginas.css'
import { useBilletera, type Billetera } from './hooks/useBilletera'
import { useRuta } from './hooks/useRuta'
import { useCuenta } from './hooks/useCuenta'
import { Lobby } from './pages/Lobby'
import { CrearTanda } from './pages/CrearTanda'
import { PaginaTanda } from './pages/PaginaTanda'
import { Demo } from './pages/Demo'
import { Estado } from './pages/Estado'
import { Historial } from './pages/Historial'
import { Perfil } from './pages/Perfil'
import { Landing } from './landing/Landing'
import { Mensaje } from './components/Mensaje'
import { BarraCuenta } from './components/BarraCuenta'
import { BotonesEntrar } from './components/BotonesEntrar'
import { BotonModo } from './components/BotonModo'
import { Campanita } from './components/Campanita'
import { nombreConocido, suscribirApodos, usarLectorDeApodos, versionApodos } from './lib/nombres'
import { leerApodo } from './lib/historial'
import { almacenLocal } from './lib/almacen'
import { guardarInvitacion, invitacionDeEntrada } from './lib/invitaciones'
import { useEffect, useSyncExternalStore } from 'react'
import { RUTA_CREAR, RUTA_DEMO, RUTA_ESTADO, RUTA_INICIO, RUTA_LOBBY, RUTA_PERFIL } from './lib/rutas'
import { EXPLORADOR, TANDA_ID } from './config'

// Los apodos públicos (M2, N4) se leen del contrato de historial, una vez por dirección.
usarLectorDeApodos(leerApodo)

export default function App() {
  const billetera = useBilletera()
  // Cuando llega un apodo, la app se vuelve a dibujar para mostrarlo en lugar de la dirección.
  useSyncExternalStore(suscribirApodos, versionApodos)
  const ruta = useRuta()
  const cuenta = useCuenta(billetera.direccion, billetera.redCorrecta)

  // Pedido 3 del plan v5: si lo primero que abre la persona es la página de una tanda (el enlace que le mandaron), se
  // anota la invitación: la campanita se la recuerda mientras no se una (lib/invitaciones.ts).
  useEffect(() => {
    const id = invitacionDeEntrada(window.location.hash)
    if (id !== null) guardarInvitacion(almacenLocal(), id, Math.floor(Date.now() / 1000))
  }, [])

  // La landing trae su propio encabezado y pie: no se le pone el de la app.
  if (ruta.tipo === 'inicio') return <Landing />

  // Cada página se viste según su función (paginas.css): elegir, pagar y cobrar, crear, proyectar, leer, revisar.
  return (
    <div className="app" data-pagina={ruta.tipo}>
      <header className="barra">
        <a className="marca" href={RUTA_INICIO}>
          <span className="logo" aria-hidden="true">
            <span className="logo-orbita" />
          </span>
          Rounda
        </a>
        {/* UX: tres cosas en el menú. "Estado" y "Demo en vivo" están en el pie. */}
        <nav className="menu" aria-label="Principal">
          <a href={RUTA_LOBBY} aria-current={ruta.tipo === 'lobby' || ruta.tipo === 'tanda' ? 'page' : undefined}>
            Mis tandas
          </a>
          <a href={RUTA_CREAR} aria-current={ruta.tipo === 'crear' ? 'page' : undefined}>
            Crear
          </a>
          <a href={RUTA_PERFIL} aria-current={ruta.tipo === 'perfil' ? 'page' : undefined}>
            Perfil
          </a>
        </nav>
        <div className="barra-lado">
          {/* Los avisos (pedido 3 del plan v5): con sesión, y no en la demo, que se proyecta. */}
          {billetera.direccion && ruta.tipo !== 'demo' && <Campanita yo={billetera.direccion} />}
          {/* La demo siempre va en oscuro (se proyecta): ahí el botón no haría nada. */}
          {ruta.tipo !== 'demo' && <BotonModo />}
          <BotonBilletera billetera={billetera} />
        </div>
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
        ) : ruta.tipo === 'historial' ? (
          <Historial key={ruta.dir ?? 'mio'} dir={ruta.dir} billetera={billetera} />
        ) : ruta.tipo === 'perfil' ? (
          <Perfil billetera={billetera} />
        ) : (
          <Mensaje titulo="Esa página no existe">
            <a href={RUTA_LOBBY}>Volver a las tandas</a>
          </Mensaje>
        )}
      </main>

      <footer className="pie">
        Rounda está en modo de práctica: los dólares son de mentira y no tienen valor real.{' '}
        <a href={RUTA_ESTADO}>Estado del sistema</a>
        {' · '}
        <a href={RUTA_DEMO}>Demo en vivo</a>
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
    const google = billetera.tipo === 'google' ? billetera.google : null
    // UX: sin direcciones G... en el camino principal. Se muestra el apodo, el correo de Google o "Mi cuenta";
    // la dirección queda en el Perfil (y al pasar el mouse).
    const nombre = nombreConocido(billetera.direccion) ?? google?.correo ?? 'Mi cuenta'
    return (
      <a className="billetera" href={RUTA_PERFIL} title={billetera.direccion}>
        <span className={billetera.redCorrecta ? 'punto ok' : 'punto mal'} aria-hidden="true" />
        <span className="billetera-nombre">{nombre}</span>
        {!billetera.redCorrecta && <span className="red-mal">Cambia a Testnet</span>}
      </a>
    )
  }
  return <BotonesEntrar billetera={billetera} chico />
}
