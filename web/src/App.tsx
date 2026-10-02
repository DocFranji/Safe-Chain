import { useState } from 'react'
import './App.css'
import { useBilletera } from './hooks/useBilletera'
import { useAhora, useTanda, useTotalTandas } from './hooks/useTanda'
import { Rueda } from './components/Rueda'
import { PanelRonda } from './components/PanelRonda'
import { ListaMiembros } from './components/ListaMiembros'
import { direccionCorta, nombreDe, NOMBRES } from './lib/nombres'
import { EXPLORADOR, TANDA_ID } from './config'

export default function App() {
  const billetera = useBilletera()
  const { total, error: errorTotal } = useTotalTandas()
  const [elegida, setElegida] = useState<number | null>(null)

  // Por defecto se muestra la tanda más reciente.
  const id = elegida ?? (total !== null && total > 0 ? total : null)
  const { datos, error, cargando, recargar } = useTanda(id)
  const ahora = useAhora()

  return (
    <div className="app">
      <header className="barra">
        <p className="marca">Tanda</p>
        <BotonBilletera billetera={billetera} />
      </header>

      <main>
        {!TANDA_ID ? (
          <Mensaje titulo="Falta configurar el contrato">
            Crea el archivo <code>web/.env</code> con <code>VITE_TANDA_ID</code> y reinicia <code>npm run dev</code>.
          </Mensaje>
        ) : errorTotal && total === null ? (
          <Mensaje titulo="No pudimos leer el contrato">{errorTotal}</Mensaje>
        ) : total === 0 ? (
          <Mensaje titulo="Todavía no hay tandas">
            Crea la primera desde la terminal con <code>bash scripts/demo.sh</code>. Pronto también desde aquí.
          </Mensaje>
        ) : (
          <>
            <nav className="selector" aria-label="Elegir tanda">
              <h1>Tanda {id ?? ''}</h1>
              {total !== null && total > 1 && id !== null && (
                <div className="selector-botones">
                  <button className="boton chico" disabled={id <= 1} onClick={() => setElegida(id - 1)}>
                    Anterior
                  </button>
                  <span>
                    {id} de {total}
                  </span>
                  <button className="boton chico" disabled={id >= total} onClick={() => setElegida(id + 1)}>
                    Siguiente
                  </button>
                </div>
              )}
            </nav>

            {error && !datos && <Mensaje titulo="No pudimos leer esta tanda">{error}</Mensaje>}
            {cargando && !datos && !error && <p className="cargando">Leyendo la tanda desde la red de Stellar…</p>}

            {datos && id !== null && (
              <>
                <div className="escenario">
                  <Rueda datos={datos} ahora={ahora} yo={billetera.direccion} />
                  <PanelRonda id={id} datos={datos} billetera={billetera} ahora={ahora} alCambiar={recargar} />
                </div>
                <ListaMiembros datos={datos} yo={billetera.direccion} />
              </>
            )}
          </>
        )}
      </main>

      <footer className="pie">
        Funciona en la red de pruebas de Stellar (testnet), con TUSD de prueba.{' '}
        {TANDA_ID && (
          <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
            Ver el contrato en el explorador
          </a>
        )}
      </footer>
    </div>
  )
}

function BotonBilletera({ billetera }: { billetera: ReturnType<typeof useBilletera> }) {
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

function Mensaje({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mensaje">
      <h2>{titulo}</h2>
      <p>{children}</p>
    </section>
  )
}
