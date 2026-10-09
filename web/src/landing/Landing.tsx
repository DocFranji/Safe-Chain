import { useRef } from 'react'
import './landing.css'
import { useRevelar } from './useRevelar'
import { RuedaMuestra } from './RuedaMuestra'
import { FotoCierre, Gente } from './Gente'
import { EXPLORADOR, TANDA_ID } from '../config'
import { RUTA_INICIO, RUTA_LOBBY } from '../lib/rutas'
import { useSesionGoogle } from '../cuentas/sesionGoogle'
import { useTema, type Tema } from '../lib/tema'
import { EntradaApp } from './entrada'
import { irASeccion } from './navegacion'
import { LandingOrbita } from './orbita/LandingOrbita'

// La promesa de la portada, con la voz de cada opción; la parte resaltada va en "enfasis".
// Montaña juega con el refrán "cuentas claras, amistades largas".
const PROMESA: Record<Tema, { antes: string; enfasis: string }> = {
  orbita: { antes: 'La tanda de siempre. ', enfasis: 'Nadie se va con la plata.' },
  sarchi: { antes: 'La tanda de siempre. ', enfasis: 'Nadie se va con la plata.' },
  montana: { antes: 'Cuentas claras, ', enfasis: 'tandas largas.' },
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
]

export function Landing() {
  const tema = useTema()
  return tema === 'orbita' ? <LandingOrbita /> : <LandingClasica tema={tema} />
}

function LandingClasica({ tema }: { tema: Tema }) {
  const raiz = useRef<HTMLDivElement>(null)
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
            <RuedaMuestra />
          </div>
          <EntradaApp />
        </section>

        {/* La prueba: tres hechos que se pueden comprobar, justo debajo de la promesa. */}
        <ul className="ln-prueba" aria-label="Lo que puedes comprobar">
          <li>
            <strong>Reglas públicas</strong>
            <span>
              El contrato corre en Stellar y cualquiera puede revisar cada pago.{' '}
              {TANDA_ID && (
                <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
                  Ver el contrato
                </a>
              )}
            </span>
          </li>
          <li>
            <strong>Sin contraseñas</strong>
            <span>{google ? 'Entras con Google o con Freighter, la billetera de Stellar.' : 'Entras con Freighter, la billetera de Stellar.'}</span>
          </li>
          <li>
            <strong>Dinero de prueba</strong>
            <span>Todo corre en la red de pruebas de Stellar: nada de esto usa dinero real.</span>
          </li>
        </ul>

        <Gente />

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
          <div className="ln-cierre-columna">
            <h2>¿Arrancamos tu primera tanda?</h2>
            <p className="ln-cierre-texto">
              {google
                ? 'Entras con tu cuenta de Google y te creamos una billetera de prueba. Si ya usas Freighter, también sirve.'
                : 'Necesitas Freighter, la billetera de Stellar para el navegador, puesta en Testnet. Los TUSD de prueba se piden gratis dentro de la app.'}
            </p>
            <a className="ln-boton principal pastilla" href={RUTA_LOBBY}>
              Abrir la app
            </a>
          </div>
          <FotoCierre tema={tema} />
        </section>

        <footer className="ln-pie">
          <span>Rounda: tandas con contrato inteligente en Stellar (testnet). Fotos ilustrativas hechas con IA.</span>
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
