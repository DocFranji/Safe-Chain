import { useEffect, useRef, useState, type MouseEvent } from 'react'
import './landing.css'
import { useRevelar } from './useRevelar'
import { EXPLORADOR, TANDA_ID } from '../config'
import { RUTA_DEMO, RUTA_INICIO, RUTA_LOBBY } from '../lib/rutas'

type Props = {
  verde?: 'esmeralda' | 'bosque' | 'lima'
}

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

export function Landing({ verde = 'esmeralda' }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  useRevelar(raiz)

  return (
    <div ref={raiz} className={`ln verde-${verde}`}>
      <div className="ln-fondo" aria-hidden="true">
        <div className="ln-brillo-1" />
        <div className="ln-brillo-2" />
        <div className="ln-cuadricula" />
      </div>

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

        <section className="ln-hero">
          <div className="ln-hero-titulo">
            <p className="ln-chip ln-entrada"><span className="ln-chip-punto" />Tandas con contrato inteligente en Stellar</p>
            <h1 className="ln-h1 ln-entrada d1">
              La tanda de siempre, <span className="ln-degradado-texto">sin que nadie se vaya con el dinero.</span>
            </h1>
          </div>
          <div className="ln-dos-columnas">
            <div className="ln-intro ln-entrada d2">
              <p>
                Un grupo aporta la misma cuota cada ronda y, por turnos, uno recibe todo. Aquí las reglas las cumple un
                contrato inteligente: cobra a tiempo, aplica multas por atraso y protege a quienes cobran al final.
              </p>
              <RuedaAnimada />
            </div>
            <EntradaApp />
          </div>
        </section>

        <section id="como" className="ln-seccion">
          <div className="ln-encabezado" data-revelar="subir">
            <span className="ln-etiqueta">CÓMO FUNCIONA</span>
            <h2 className="ln-titulo-seccion">Cuatro pasos.</h2>
            <p className="ln-texto-grande">Lo mismo que una tanda entre amigos, con las cuentas siempre claras.</p>
          </div>
          <ol className="ln-pasos">
            {PASOS.map((p, i) => (
              <li key={p.t} className="ln-paso" data-revelar="subir" data-retraso={i * 120}>
                <Escena paso={i} />
                <span className="ln-paso-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="seguridad" className="ln-seccion">
          <div className="ln-encabezado" data-revelar="subir">
            <span className="ln-etiqueta">SEGURIDAD</span>
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
                  <span className="ln-regla-num">{String(i + 1).padStart(2, '0')}</span>
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

/* ---------- Rueda que pasa el turno cada 2.4 s ---------- */
const NOMBRES = ['Ana', 'Beto', 'Carla', 'Tú', 'Diego']

function RuedaAnimada() {
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPaso((p) => p + 1), 2400)
    return () => clearInterval(t)
  }, [])
  const actual = paso % NOMBRES.length

  return (
    <div className="ln-rueda" aria-label={`Ejemplo: en esta ronda cobra ${NOMBRES[actual]}`}>
      <div className="ln-rueda-pista" />
      <div className="ln-rueda-arco" style={{ transform: `rotate(${paso * 72 - 36}deg)` }} />
      <div className="ln-rueda-centro">
        <div>
          <small>Cobra ahora</small>
          <strong>{NOMBRES[actual]}</strong>
          <span>+500 TUSD</span>
        </div>
      </div>
      {NOMBRES.map((nombre, i) => {
        const a = ((-90 + i * 72) * Math.PI) / 180
        const clase = i === actual ? 'turno' : i < actual ? 'pagado' : ''
        return (
          <div key={nombre} className={`ln-nodo ${clase}`} style={{ left: `${50 + 37 * Math.cos(a)}%`, top: `${50 + 37 * Math.sin(a)}%` }}>
            <div className="ln-nodo-punto">{i + 1}</div>
            <span className="ln-nodo-nombre">{nombre}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Mini animaciones de cada paso ---------- */
function Escena({ paso }: { paso: number }) {
  if (paso === 0)
    return (
      <div className="ln-escena" aria-hidden="true">
        {[1, 0.75, 0.55, 0.35].map((o, i) => (
          <div key={o} className="ln-persona" style={{ opacity: o, animationDelay: `${i * 0.25}s` }} />
        ))}
        <div className="ln-persona libre" style={{ animationDelay: '1s' }}>+</div>
      </div>
    )
  if (paso === 1)
    return (
      <div className="ln-escena abajo" aria-hidden="true">
        {[70, 56, 42, 28, 14].map((h, i) => (
          <div key={h} className="ln-barrita" style={{ height: h, opacity: 1 - i * 0.17, animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    )
  if (paso === 2)
    return (
      <div className="ln-escena columna" aria-hidden="true">
        <div className="ln-monedas">
          {[0, 0.4, 0.8].map((d) => <div key={d} className="ln-moneda" style={{ animationDelay: `${d}s` }} />)}
        </div>
        <div className="ln-alcancia" />
      </div>
    )
  return (
    <div className="ln-escena columna" aria-hidden="true">
      <span className="ln-cobro-monto">+500 TUSD</span>
      <div className="ln-cobro-punto" />
    </div>
  )
}

/* ---------- Entrada a la app ----------
 * No hay cuentas con correo ni contraseña: la identidad en Rounda es la billetera Stellar (Freighter).
 * Un formulario de registro sin servidor detrás pediría datos que no iban a ningún lado. */
function EntradaApp() {
  return (
    <div className="ln-cuenta ln-entrada d3">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2>Empieza en un minuto</h2>
        <p className="ln-sub">Sin registro ni contraseñas: tu billetera Stellar es tu cuenta.</p>
      </div>

      <a className="ln-boton principal" href={RUTA_LOBBY}>
        Abrir la app
      </a>
      <a className="ln-boton secundario" href={RUTA_DEMO}>
        Ver la demo en vivo
      </a>

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
    </div>
  )
}
