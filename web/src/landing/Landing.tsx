import { useEffect, useRef, useState, type MouseEvent } from 'react'
import './landing.css'
import { useRevelar } from './useRevelar'
import { RuedaMuestra } from './RuedaMuestra'
import { EXPLORADOR, TANDA_ID } from '../config'
import { RUTA_DEMO, RUTA_INICIO, RUTA_LOBBY } from '../lib/rutas'
import { useSesionGoogle } from '../cuentas/sesionGoogle'
import { useTema, type Tema } from '../lib/tema'
import { Cusuco } from '../components/Cusuco'

// La promesa de la portada. Cada diseño en prueba tiene su frase; la parte resaltada va en "enfasis".
const PROMESA: Record<Tema, { antes: string; enfasis: string }> = {
  carreta: { antes: 'La tanda de siempre, ', enfasis: 'sin que nadie se vaya con la plata.' },
  fintech: { antes: 'La tanda de siempre, ', enfasis: 'sin que nadie se vaya con la plata.' },
  lima: { antes: 'La tanda donde ', enfasis: 'nadie se va con la plata.' },
  cusuco: { antes: 'Tu tanda, ', enfasis: 'protegida como un cusuco.' },
  ronda: { antes: 'En esta ronda, ', enfasis: 'todos cobran.' },
}

const PASOS = [
  { t: 'Crea o únete', d: 'Defines la cuota, cuántas personas y cada cuánto se paga. Mandas el enlace a tu grupo.' },
  { t: 'Deja tu garantía', d: 'Antes de entrar ves cuánto vas a depositar. Quien cobra primero deja más.' },
  { t: 'Paga cada ronda', d: 'Todos ponen la misma cuota. Si te atrasas, pagas una multa.' },
  { t: 'Cobra en tu turno', d: 'Al cerrar la ronda, la bolsa le llega a quien le toca. Al final recuperas tu garantía con rendimiento.' },
]

const REGLAS = [
  { t: 'Garantía escalonada', d: 'Cobrar primero cuesta más garantía, así que irse con la bolsa no sale a cuenta.' },
  { t: 'Multas por atraso', d: 'Si pagas tarde, pagas una multa, y esa multa se reparte entre quienes cumplieron.' },
  { t: 'Tu garantía gana rendimiento', d: 'Mientras esperas tu turno, la garantía queda en una bóveda que genera rendimiento.' },
  { t: 'Reglas públicas', d: 'El contrato corre en Stellar y cualquiera puede revisar cada pago.' },
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
  const tema = useTema()
  const google = useSesionGoogle()
  useRevelar(raiz)
  const promesa = PROMESA[tema]

  return (
    <div ref={raiz} className="ln">
      <div className="ln-contenedor">
        <header className="ln-barra">
          <p className="ln-marca">
            <span className="ln-logo" aria-hidden="true">
              <span className="ln-logo-orbita" />
            </span>
            Rounda
          </p>
          <nav className="ln-nav">
            <a href={RUTA_INICIO} onClick={irASeccion('como')}>
              Cómo funciona
            </a>
            <a href={RUTA_INICIO} onClick={irASeccion('seguridad')}>
              Seguridad
            </a>
            <a className="ln-boton contorno" href={RUTA_LOBBY}>
              Abrir la app
            </a>
          </nav>
        </header>

        {/* La portada: a la izquierda la promesa y cómo entrar; a la derecha, la rueda funcionando. */}
        <section className="ln-hero">
          <h1 className="ln-h1 ln-entrada d1">
            {promesa.antes}
            <span className="ln-enfasis">{promesa.enfasis}</span>
          </h1>
          <p className="ln-intro ln-entrada d2">
            Todos ponen la misma cuota y, por turnos, uno cobra la bolsa. Un contrato en Stellar hace cumplir las reglas.
          </p>
          <div className="ln-hero-rueda ln-entrada d2">
            {tema === 'cusuco' && <CusucoQueLlega />}
            <RuedaMuestra />
          </div>
          <EntradaApp />
        </section>

        <section id="como" className="ln-seccion">
          <div className="ln-encabezado" data-revelar="subir">
            <h2 className="ln-titulo-seccion">De unirte a cobrar, en cuatro pasos.</h2>
            <p className="ln-texto-grande">Igual que la tanda entre amigos, con las cuentas siempre a la vista.</p>
          </div>
          <ol className="ln-pasos">
            {PASOS.map((p, i) => (
              <li key={p.t} className="ln-paso" data-revelar="subir" data-retraso={i * 120}>
                <span className="ln-paso-num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="seguridad" className="ln-seccion">
          <div className="ln-encabezado" data-revelar="subir">
            <h2 className="ln-titulo-seccion">El miedo de siempre: que el primero cobre y desaparezca.</h2>
            <p className="ln-texto-grande">
              Cada persona deja una garantía al unirse. Si alguien deja de pagar, su garantía cubre al grupo.
            </p>
          </div>
          <div className="ln-dos-columnas ln-bento">
            <div className="ln-grafica" data-revelar="subir" data-retraso="150">
              {tema === 'cusuco' && (
                <div className="ln-grafica-cusuco">
                  <Cusuco pose="bola" />
                  <p>El cusuco se enrolla para protegerse. Con la garantía, el grupo protege su plata.</p>
                </div>
              )}
              <p className="ln-grafica-titulo">Garantía según tu turno</p>
              <div className="ln-grafica-barras">
                {/* Para 5 personas con garantía del 100 %: 400, 300, 200, 100 y 100 sobre 400 (el último nunca baja de 1 cuota). */}
                {[100, 75, 50, 25, 25].map((h, i) => (
                  <div key={i} data-revelar="crecer" data-retraso={200 + i * 100} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="ln-grafica-ejes">
                {['1.º', '2.º', '3.º', '4.º', '5.º'].map((t) => (
                  <span key={t}>{t}</span>
                ))}
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
          <h2>¿Arrancamos tu primera tanda?</h2>
          <p className="ln-cierre-texto">
            {google
              ? 'Entras con tu cuenta de Google y te creamos una billetera de prueba. Si ya usas Freighter, también sirve.'
              : 'Necesitas Freighter, la billetera de Stellar para el navegador, puesta en Testnet. Los TUSD de prueba se piden gratis dentro de la app.'}
          </p>
          <a className="ln-boton principal pastilla" href={RUTA_LOBBY}>
            Abrir la app
          </a>
        </section>

        <footer className="ln-pie">
          <span>Funciona en la red de pruebas de Stellar (testnet): nada de esto usa dinero real.</span>
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

/** El cusuco llega rodando hecho bola, se desenrolla y saluda (con "reducir movimiento", solo saluda). */
function CusucoQueLlega() {
  return (
    <div className="ln-cusuco" aria-hidden="true">
      <Cusuco pose="bola" className="ln-cusuco-bola" />
      <Cusuco pose="saluda" className="ln-cusuco-pie" />
    </div>
  )
}

/* ---------- Entrada a la app ----------
 * No hay contraseñas. Se entra de una de dos formas:
 *  - con Google (Privy): se crea una billetera Stellar para esa cuenta, sin instalar nada;
 *  - con Freighter, la billetera de Stellar, como siempre (desde la app).
 * Si la web no tiene VITE_PRIVY_APP_ID, el botón principal abre la app (y ahí se conecta Freighter). */
function EntradaApp() {
  const google = useSesionGoogle()
  const [quiereEntrar, setQuiereEntrar] = useState(false)

  // Después de entrar con Google, directo a la app.
  useEffect(() => {
    if (quiereEntrar && google?.conectada) window.location.hash = RUTA_LOBBY
  }, [quiereEntrar, google?.conectada])

  return (
    <div className="ln-acciones ln-entrada d3">
      {google ? (
        google.conectada ? (
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
        )
      ) : (
        <a className="ln-boton principal" href={RUTA_LOBBY}>
          Abrir la app
        </a>
      )}
      <a className="ln-boton secundario" href={RUTA_DEMO}>
        Ver la demo en vivo
      </a>
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
