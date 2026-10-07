import { useEffect, useRef, useState, type MouseEvent } from 'react'
import './landing.css'
import { useRevelar } from './useRevelar'
import { RuedaMuestra } from './RuedaMuestra'
import { EXPLORADOR, TANDA_ID } from '../config'
import { RUTA_DEMO, RUTA_INICIO, RUTA_LOBBY } from '../lib/rutas'
import { useSesionGoogle } from '../cuentas/sesionGoogle'

const PASOS = [
  { t: 'Crea o únete', d: 'Define la cuota, cuántas personas y cada cuánto se paga. Comparte el enlace con tu grupo.' },
  { t: 'Deja tu colateral', d: 'Antes de entrar ves cuánto vas a depositar. Quien cobra primero deja más.' },
  { t: 'Paga cada ronda', d: 'Todos aportan la misma cuota. Si alguien se atrasa, paga una multa.' },
  { t: 'Cobra en tu turno', d: 'Al cerrar la ronda, el total va a quien le toca. Al final recuperas tu colateral con rendimiento.' },
]

const REGLAS = [
  { t: 'Colateral escalonado', d: 'Cobrar primero cuesta más garantía, así nadie gana con irse.' },
  { t: 'Multas por atraso', d: 'Pagar tarde tiene un costo que se reparte entre quienes cumplen.' },
  { t: 'Tu colateral genera rendimiento', d: 'Mientras espera, el dinero no está quieto.' },
  { t: 'Reglas públicas', d: 'El contrato corre en Stellar. Cualquiera puede revisar cada pago.' },
]

/**
 * Las rutas de la app usan el # de la URL (#/tandas, #/tanda/3...). Por eso las anclas de esta página
 * NO pueden ser href="#como": cambiarían la ruta y saldría "Esa página no existe". Se desplaza con scroll.
 */
function irASeccion(id: string) {
  return (e: MouseEvent) => {
    e.preventDefault()
    const destino = document.getElementById(id)
    if (!destino) return
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    destino.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' })
  }
}

export function Landing() {
  const raiz = useRef<HTMLDivElement>(null)
  useRevelar(raiz)

  return (
    <div ref={raiz} className="ln">

      <div className="ln-contenedor">
        <header className="ln-barra">
          <p className="ln-marca">
            <span className="ln-logo" aria-hidden="true"><span className="ln-logo-orbita" /></span>
            Rounda
          </p>
          <nav className="ln-nav">
            <a href={RUTA_INICIO} onClick={irASeccion('como')}>Cómo funciona</a>
            <a href={RUTA_INICIO} onClick={irASeccion('seguridad')}>Seguridad</a>
            <a className="ln-boton contorno" href={RUTA_LOBBY}>Abrir app</a>
          </nav>
        </header>

        {/* La portada es una grilla: a la izquierda la promesa y cómo entrar; a la derecha, la rueda funcionando. */}
        <section className="ln-hero">
          <h1 className="ln-h1 ln-entrada d1">
            La tanda de siempre, <span className="ln-enfasis">sin que nadie se vaya con el dinero.</span>
          </h1>
          <p className="ln-intro ln-entrada d2">
            Un grupo aporta la misma cuota cada ronda y, por turnos, uno recibe todo. Aquí las reglas las cumple un contrato
            inteligente: cobra a tiempo, aplica multas por atraso y protege a quienes cobran al final.
          </p>
          <div className="ln-hero-rueda ln-entrada d2">
            <RuedaMuestra />
          </div>
          <EntradaApp />
        </section>

        <section id="como" className="ln-seccion">
          <div className="ln-encabezado" data-revelar="subir">
            <h2 className="ln-titulo-seccion">Cuatro pasos.</h2>
            <p className="ln-texto-grande">Lo mismo que una tanda entre amigos, con las cuentas siempre claras.</p>
          </div>
          <ol className="ln-pasos">
            {PASOS.map((p, i) => (
              <li key={p.t} className="ln-paso" data-revelar="subir" data-retraso={i * 120}>
                <span className="ln-paso-num" aria-hidden="true">{i + 1}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="seguridad" className="ln-seccion">
          <div className="ln-encabezado" data-revelar="subir">
            <h2 className="ln-titulo-seccion" style={{ maxWidth: '16ch' }}>El riesgo de siempre: el primero cobra y desaparece.</h2>
          </div>
          <div className="ln-dos-columnas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <p className="ln-texto-grande" data-revelar="subir">
                Por eso cada quien deja un colateral al unirse. Quien cobra antes deja más, porque tiene más que perder.
                Si alguien deja de pagar, su colateral cubre a los demás.
              </p>
              <div className="ln-grafica" data-revelar="subir" data-retraso="150">
                <p className="ln-grafica-titulo">Colateral según tu turno</p>
                <div className="ln-grafica-barras">
                  {/* Para 5 personas con garantía del 100 %: 400, 300, 200, 100 y 100 sobre 400 (el último nunca baja de 1 cuota). */}
                  {[100, 75, 50, 25, 25].map((h, i) => (
                    <div key={i} data-revelar="crecer" data-retraso={200 + i * 100} style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="ln-grafica-ejes">
                  {['1.º', '2.º', '3.º', '4.º', '5.º'].map((t) => <span key={t}>{t}</span>)}
                </div>
              </div>
            </div>
            <dl className="ln-reglas">
              {REGLAS.map((r, i) => (
                <div key={r.t} className="ln-regla" data-revelar="subir" data-retraso={i * 100}>
                  <dt>{r.t}</dt>
                  <dd>{r.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="ln-cierre" data-revelar="subir">
          <h2>¿Listo para tu primera tanda?</h2>
          <a className="ln-boton principal pastilla" style={{ position: 'relative' }} href={RUTA_LOBBY}>
            Abrir la app →
          </a>
        </section>

        <footer className="ln-pie">
          <span>Rounda funciona en la red de pruebas de Stellar (testnet), con TUSD de prueba.</span>
          {TANDA_ID && (
            <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
              Ver el contrato en el explorador
            </a>
          )}
        </footer>
      </div>
    </div>
  )
}

/* ---------- Entrada a la app ----------
 * No hay contraseñas. Se entra de una de dos formas:
 *  - con Google (Privy): se crea una billetera Stellar para esa cuenta, sin instalar nada;
 *  - con Freighter, la billetera de Stellar, como siempre.
 * Si la web no tiene VITE_PRIVY_APP_ID, solo aparece el camino de Freighter. */
function EntradaApp() {
  const google = useSesionGoogle()
  const [quiereEntrar, setQuiereEntrar] = useState(false)

  // Después de entrar con Google, directo a la app.
  useEffect(() => {
    if (quiereEntrar && google?.conectada) window.location.hash = RUTA_LOBBY
  }, [quiereEntrar, google?.conectada])

  return (
    <div className="ln-cuenta ln-entrada d3">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2>Empieza en un minuto</h2>
        <p className="ln-sub">
          {google
            ? 'Sin contraseñas: entra con tu cuenta de Google y te creamos tu billetera de pruebas.'
            : 'Sin registro ni contraseñas: tu billetera Stellar es tu cuenta.'}
        </p>
      </div>

      {google &&
        (google.conectada ? (
          <a className="ln-boton principal" href={RUTA_LOBBY}>
            Ir a mis tandas
          </a>
        ) : (
          <button
            className="ln-boton google"
            disabled={!google.lista}
            onClick={() => {
              setQuiereEntrar(true)
              google.entrar()
            }}
          >
            <LogoGoogle />
            Continuar con Google
          </button>
        ))}

      {!google?.conectada && (
        <a className={google ? 'ln-boton secundario' : 'ln-boton principal'} href={RUTA_LOBBY}>
          {google ? 'Entrar con Freighter' : 'Abrir la app'}
        </a>
      )}
      <a className="ln-boton secundario" href={RUTA_DEMO}>
        Ver la demo en vivo
      </a>

      {google ? (
        <p className="ln-legal">
          ¿Ya usas Freighter? También puedes conectarla dentro de la app. Funciona en la red de pruebas de Stellar: nada de lo
          que ves aquí usa dinero real.
        </p>
      ) : (
        <>
          <div className="ln-separador">para participar necesitas</div>

          <ol className="ln-requisitos">
            <li>
              <span>1</span>
              <p>
                <a href="https://freighter.app" target="_blank" rel="noreferrer">
                  Freighter
                </a>
                , la billetera de Stellar (extensión para el navegador de escritorio).
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                Ponerla en <strong>Testnet</strong>: es dinero de prueba, no cuesta nada.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>Pedir TUSD gratis dentro de la app y listo.</p>
            </li>
          </ol>

          <p className="ln-legal">Funciona en la red de pruebas de Stellar. Nada de lo que ves aquí usa dinero real.</p>
        </>
      )}
    </div>
  )
}

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
