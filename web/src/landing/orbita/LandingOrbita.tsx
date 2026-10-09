// Portada de la opción C · Órbita. Toma la estética y el movimiento de las plantillas de Framer que eligió la
// persona (Vallure como base; Arewno, Payer y Cryptor para los círculos) y la adapta a Rounda: todo gira porque la
// marca es una ronda. Los datos son de verdad: la rueda de ejemplo, los presets de "Crear" y las reglas del contrato.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import '../landing.css'
import './orbita.css'
import { useRevelar } from '../useRevelar'
import { EntradaApp } from '../entrada'
import { irASeccion } from '../navegacion'
import { RuedaMuestra } from '../RuedaMuestra'
import { estadoMuestra, NOMBRES, usePasoMuestra } from '../muestra'
import { Contador, Logo, Orbitas, Palabras, TextoQueSeLlena, type Anillo, type Astro } from './piezas'
import { useEnPantalla } from './movimiento'
import { EXPLORADOR, TANDA_ID } from '../../config'
import { RUTA_CREAR, RUTA_DEMO, RUTA_ESTADO, RUTA_INICIO, RUTA_LOBBY } from '../../lib/rutas'
import { useSesionGoogle } from '../../cuentas/sesionGoogle'
import { bolsa, colateralDeTurno, tablaColateral } from '../../lib/colateral'
import fotoFamilia from '../../assets/fotos/familia.webp'
import abuela from '../../assets/fotos/caras/abuela.webp'
import nieta from '../../assets/fotos/caras/nieta.webp'
import oficina1 from '../../assets/fotos/caras/oficina-1.webp'
import oficina2 from '../../assets/fotos/caras/oficina-2.webp'
import oficina3 from '../../assets/fotos/caras/oficina-3.webp'
import vecina from '../../assets/fotos/caras/vecina.webp'
import vecino from '../../assets/fotos/caras/vecino.webp'
import artesano from '../../assets/fotos/caras/artesano.webp'
import cafetal from '../../assets/fotos/caras/cafetal.webp'

const CARAS = [abuela, oficina1, vecina, cafetal, nieta, oficina2, artesano, vecino, oficina3]
/** Las caras de la tanda de ejemplo (Ana, Beto, Carla, Tú, Diego), en el celular de la portada. */
const CARAS_MUESTRA = [vecina, oficina1, nieta, oficina2, vecino]

const ANILLOS_HEROE: Anillo[] = [
  { d: 560, vel: 70, astros: [{ a: 200, cara: abuela }, { a: 320, cara: vecino }, { a: 80, cara: nieta, tam: 44 }] },
  {
    d: 840,
    vel: 100,
    contra: true,
    astros: [{ a: 150, cara: oficina1 }, { a: 215, cara: cafetal, tam: 46 }, { a: 330, cara: oficina2 }, { a: 20 }, { a: 265 }],
  },
  { d: 1120, vel: 140, astros: [{ a: 185, cara: artesano, tam: 48 }, { a: 345, cara: vecina, tam: 46 }, { a: 240 }, { a: 300 }] },
]
const ANILLOS_GENTE: Anillo[] = [
  { d: 680, vel: 80, astros: [0, 60, 120, 180, 240, 300].map((a, i) => ({ a, cara: CARAS[i], tam: 64 })) },
  {
    d: 980,
    vel: 120,
    contra: true,
    astros: [...[30, 150, 270].map((a, i): Astro => ({ a, cara: CARAS[6 + i], tam: 52 })), { a: 90 }, { a: 210 }, { a: 330 }],
  },
]
const ANILLOS_CIERRE: Anillo[] = [
  { d: 520, vel: 60, astros: [{ a: 30, cara: nieta, tam: 46 }, { a: 210, cara: oficina3, tam: 46 }, { a: 120 }] },
  { d: 820, vel: 90, contra: true, astros: [{ a: 160, cara: abuela, tam: 50 }, { a: 340, cara: cafetal, tam: 50 }, { a: 60 }, { a: 250 }] },
]

const USOS = ['El aguinaldo', 'El marchamo', 'Los útiles de enero', 'El viaje del grupo', 'Una emergencia', 'La tanda de la oficina', 'La de la familia', 'La del barrio']

// Los dos ritmos salen de los ejemplos de "Crear" (pages/CrearTanda.tsx), con las reglas del contrato.
const RITMOS = [
  { nombre: 'Quincenal × 6', detalle: 'Una ronda cada 15 días · 3 meses', cuota: 50n, n: 6, multa: 5 },
  { nombre: 'Mensual × 12', detalle: 'Una ronda por mes · 1 año', cuota: 50n, n: 12, multa: 5 },
]
const COBERTURA = 10_000
const EJEMPLO = { cuota: 50n, nMiembros: 6, coberturaBps: COBERTURA }

export function LandingOrbita() {
  const raiz = useRef<HTMLDivElement>(null)
  const heroe = useRef<HTMLElement>(null)
  const [sobreHeroe, setSobreHeroe] = useState(true)
  useRevelar(raiz)

  // La barra flotante es oscura sobre la portada y clara sobre el resto.
  useEffect(() => {
    const el = heroe.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setSobreHeroe(e.isIntersecting), { rootMargin: '-64px 0px -100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={raiz} className="ln lo">
      <header className={sobreHeroe ? 'lo-nav sobre-heroe' : 'lo-nav'}>
        <nav className="lo-nav-pildora" aria-label="Portada">
          <a
            className="lo-nav-marca"
            href={RUTA_INICIO}
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
            }}
          >
            <Logo tam={20} />
            Rounda
          </a>
          <span className="lo-nav-enlaces">
            <a href={RUTA_INICIO} onClick={irASeccion('como')}>
              Cómo funciona
            </a>
            <a href={RUTA_INICIO} onClick={irASeccion('seguridad')}>
              Seguridad
            </a>
            <a href={RUTA_INICIO} onClick={irASeccion('preguntas')}>
              Preguntas
            </a>
          </span>
          <a className="lo-boton azul chico" href={RUTA_LOBBY}>
            Abrir la app
          </a>
        </nav>
      </header>

      <Heroe refHeroe={heroe} />
      <Haz />
      <QueEs />
      <Pasos />
      <Seguridad />
      <LaGente />
      <Ritmos />
      <Preguntas />
      <Cierre />
      <Pie />
    </div>
  )
}

/* ---------- Portada: la promesa, el celular con la rueda de verdad y la ronda de personas alrededor ---------- */
function Heroe({ refHeroe }: { refHeroe: RefObject<HTMLElement | null> }) {
  const paso = usePasoMuestra()
  const e = estadoMuestra(paso)
  const ultimo = NOMBRES[(e.ronda + e.pagaron - 1) % e.n]
  return (
    <section ref={refHeroe} className="lo-heroe">
      <div className="lo-contenedor lo-heroe-texto">
        <p className="lo-insignia vidrio lo-aparece">
          <Logo tam={13} />
          Tandas en la red de pruebas de Stellar
        </p>
        <h1 className="lo-h1">
          <Palabras renglones={['La tanda de siempre.', 'Nadie se va con la plata.']} retraso={120} />
        </h1>
        <p className="lo-heroe-sub lo-aparece d2">
          Todos ponen la misma cuota y, por turnos, uno cobra la bolsa. Un contrato en Stellar hace cumplir las reglas.
        </p>
        <EntradaApp clases={{ caja: 'lo-acciones lo-aparece d3', principal: 'lo-boton blanco', google: 'lo-boton blanco', secundario: 'lo-boton vidrio' }} />
      </div>

      <div className="lo-escena">
        <Orbitas anillos={ANILLOS_HEROE} className="lo-orbitas-heroe" />
        <div className="lo-telefono" role="img" aria-label={`Ejemplo en vivo: tanda de 5 personas, ronda ${e.ronda + 1}. Cobra ${e.cobra}.`}>
          <div className="lo-telefono-pantalla" aria-hidden="true">
            <div className="lo-tel-estado">
              <span>9:41</span>
              <span className="lo-tel-isla" />
              <span>TUSD</span>
            </div>
            <div className="lo-tel-cabeza">
              <strong>Tanda de la oficina</strong>
              <span className="lo-tel-chip">En curso</span>
            </div>
            <RuedaMuestra paso={paso} nota={false} />
            <div className="lo-tel-ronda">
              <strong>
                Ronda {e.ronda + 1} de {e.n}
              </strong>
              <span>Cobra {e.cobra}</span>
            </div>
            <ul className="lo-tel-lista">
              {NOMBRES.map((n, i) => (
                <li key={n} className={e.pago[i] ? 'pago' : undefined}>
                  <img src={CARAS_MUESTRA[i]} alt="" width={28} height={28} />
                  <span>{n}</span>
                  <em>{e.pago[i] ? 'Pagó' : 'Por pagar'}</em>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="lo-flota izq" aria-hidden="true">
          <span className="lo-flota-icono">
            <Visto />
          </span>
          <span>
            <strong key={ultimo + paso} className="lo-flota-cambia">
              {ultimo} pagó
            </strong>
            <small>100 TUSD · ronda {e.ronda + 1}</small>
          </span>
        </div>
        <div className="lo-flota der" aria-hidden="true">
          <Anillito parte={e.pagaron / e.n} />
          <span>
            <strong>Bolsa de la ronda</strong>
            <small>
              {e.pagaron} de {e.n} pagaron · 500 TUSD
            </small>
          </span>
        </div>
        <div className="lo-flota der-abajo" aria-hidden="true">
          <span className="lo-flota-icono gira">
            <Logo tam={16} />
          </span>
          <span>
            <strong>Tu garantía</strong>
            <small>Vuelve al final, con rendimiento</small>
          </span>
        </div>
      </div>
    </section>
  )
}

/* ---------- El haz: la ronda de personas pasa por el centro; a cada una le toca su turno ---------- */
function Haz() {
  const [ref] = useEnPantalla<HTMLElement>('80px')
  return (
    <section ref={ref} className="lo-haz-seccion" aria-labelledby="lo-haz-titulo">
      <p id="lo-haz-titulo" className="lo-haz-titulo" data-revelar="blur">
        Cada ronda, la bolsa le toca a alguien. Para lo que haga falta:
      </p>
      <div className="lo-haz" aria-hidden="true">
        <div className="lo-haz-linea" />
        <div className="lo-haz-pista">
          {[...CARAS, ...CARAS].map((c, i) => (
            <span key={i} className="lo-haz-astro">
              <img src={c} alt="" width={64} height={64} loading="lazy" decoding="async" />
            </span>
          ))}
        </div>
        <div className="lo-haz-centro">
          <Logo tam={40} />
        </div>
      </div>
      <div className="lo-usos">
        <ul className="lo-usos-pista">
          {USOS.map((u) => (
            <li key={u}>{u}</li>
          ))}
          {USOS.map((u) => (
            <li key={u + '-2'} aria-hidden="true">
              {u}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Qué es: el párrafo se llena de tinta al bajar ---------- */
function QueEs() {
  return (
    <section className="lo-seccion">
      <div className="lo-contenedor lo-que-es">
        <p className="lo-insignia">Qué es Rounda</p>
        <TextoQueSeLlena texto="Rounda es la tanda de siempre: el grupo pone la misma cuota cada ronda y, por turnos, una persona cobra la bolsa. La diferencia es que las reglas no dependen de la buena fe de nadie. Las cumple un contrato en Stellar que nadie puede cambiar." />
      </div>
    </section>
  )
}

function Encabezado({ insignia, titulo, texto, centrado = false }: { insignia: string; titulo: string[]; texto?: ReactNode; centrado?: boolean }) {
  return (
    <div className={centrado ? 'lo-encabezado centrado' : 'lo-encabezado'} data-revelar="blur">
      <p className="lo-insignia">{insignia}</p>
      <h2 className="lo-h2">
        <Palabras renglones={titulo} />
      </h2>
      {texto && <p className="lo-texto">{texto}</p>}
    </div>
  )
}

/* ---------- Pasos: tarjetas que se apilan al bajar, cada una con su pantalla de la app ---------- */
const PASOS: { t: string; d: string; nota: string; pantalla: ReactNode }[] = [
  {
    t: 'Crea o únete',
    d: 'Defines la cuota, cuántas personas y cada cuánto se paga, y mandas el enlace a tu grupo.',
    nota: 'De 3 a 12 personas',
    pantalla: <PantallaCrear />,
  },
  {
    t: 'Deja tu garantía',
    d: 'Antes de entrar ves cuánto vas a depositar. Quien cobra primero deja más.',
    nota: 'La garantía vuelve al final',
    pantalla: <PantallaGarantia />,
  },
  {
    t: 'Paga cada ronda',
    d: 'Todos ponen la misma cuota. Si te atrasas, pagas una multa que se reparte entre quienes cumplieron.',
    nota: 'Cada pago queda en la red',
    pantalla: <PantallaPagos />,
  },
  {
    t: 'Cobra en tu turno',
    d: 'Al cerrar la ronda, la bolsa le llega a quien le toca. Al final recuperas tu garantía con rendimiento.',
    nota: 'El orden lo guarda el contrato',
    pantalla: <PantallaCobro />,
  },
]

function Pasos() {
  return (
    <section id="como" className="lo-seccion gris">
      <div className="lo-contenedor">
        <Encabezado
          insignia="Cómo funciona"
          titulo={['Cuatro pasos.', 'Una vuelta completa.']}
          texto="Igual que la tanda entre amigos, con las cuentas siempre a la vista."
          centrado
        />
        <ol className="lo-pasos">
          {PASOS.map((p, i) => (
            <li key={p.t} className="lo-paso" style={{ '--k': i } as CSSProperties}>
              <div className="lo-paso-texto">
                <span className="lo-paso-num" aria-hidden="true">
                  0{i + 1}
                </span>
                <p className="lo-paso-etiqueta">Paso {i + 1}</p>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
                <p className="lo-paso-nota">
                  <Visto />
                  {p.nota}
                </p>
              </div>
              <div className="lo-pantalla" aria-hidden="true">
                {p.pantalla}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function PantallaCrear() {
  return (
    <>
      <p className="lo-pantalla-titulo">Nueva tanda</p>
      <dl className="lo-pantalla-filas">
        <div>
          <dt>Cuota</dt>
          <dd>50 TUSD</dd>
        </div>
        <div>
          <dt>Personas</dt>
          <dd>6</dd>
        </div>
        <div>
          <dt>Cada</dt>
          <dd>15 días</dd>
        </div>
        <div>
          <dt>Multa por atraso</dt>
          <dd>5 %</dd>
        </div>
      </dl>
      <span className="lo-pantalla-boton">Crear la tanda</span>
    </>
  )
}

function PantallaGarantia() {
  const tabla = tablaColateral(EJEMPLO).map(Number)
  const max = Math.max(...tabla)
  return (
    <>
      <p className="lo-pantalla-titulo">Garantía según tu turno</p>
      <ul className="lo-pantalla-barras">
        {tabla.map((g, i) => (
          <li key={i} className={i === 0 ? 'primero' : undefined}>
            <span>Turno {i + 1}</span>
            <i style={{ '--w': `${(g / max) * 100}%` } as CSSProperties} />
            <b>{g} TUSD</b>
          </li>
        ))}
      </ul>
    </>
  )
}

function PantallaPagos() {
  const nombres = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Tú']
  const caras = [vecina, oficina1, nieta, vecino, cafetal, oficina2]
  return (
    <>
      <div className="lo-pantalla-cabeza">
        <p className="lo-pantalla-titulo">Ronda 3 de 6</p>
        <Anillito parte={5 / 6} oscuro />
      </div>
      <ul className="lo-pantalla-personas">
        {nombres.map((n, i) => (
          <li key={n} className={i < 5 ? 'pago' : undefined}>
            <img src={caras[i]} alt="" width={26} height={26} loading="lazy" decoding="async" />
            <span>{n}</span>
            <em>{i < 5 ? 'Pagó' : 'Por pagar'}</em>
          </li>
        ))}
      </ul>
    </>
  )
}

function PantallaCobro() {
  const b = Number(bolsa(EJEMPLO))
  return (
    <div className="lo-pantalla-cobro">
      <svg viewBox="0 0 120 120" className="lo-anillo-grande">
        <circle cx="60" cy="60" r="52" className="pista" />
        <circle cx="60" cy="60" r="52" className="lleno" pathLength={100} />
      </svg>
      <div>
        <p className="lo-pantalla-titulo">Te toca</p>
        <p className="lo-pantalla-monto">{b} TUSD</p>
        <p className="lo-pantalla-nota">La bolsa de la ronda. Tu garantía vuelve al final, con rendimiento.</p>
      </div>
    </div>
  )
}

/* ---------- Seguridad: el bento, cada pieza con su pequeño movimiento ---------- */
function Seguridad() {
  const tabla = tablaColateral({ cuota: 100n, nMiembros: 5, coberturaBps: COBERTURA }).map(Number)
  const max = Math.max(...tabla)
  const [refPulso] = useEnPantalla<HTMLDivElement>()
  return (
    <section id="seguridad" className="lo-seccion">
      <div className="lo-contenedor">
        <Encabezado
          insignia="Seguridad"
          titulo={['Reglas que nadie', 'se puede saltar.']}
          texto="El miedo de siempre es que el primero cobre y desaparezca. El contrato lo vuelve un mal negocio."
          centrado
        />
        <div className="lo-bento">
          <article className="lo-pieza ancha" data-revelar="blur">
            <h3>Quien cobra primero, deja más</h3>
            <p>La garantía baja turno a turno. Irse después de cobrar cuesta más de lo que se gana.</p>
            <div className="lo-barras" aria-label="Garantía por turno en una tanda de 5 personas con cuota de 100 TUSD">
              {tabla.map((g, i) => (
                <div key={i} className="lo-barra-col">
                  <b>{g}</b>
                  <i style={{ '--h': `${(g / max) * 100}%`, '--k': i } as CSSProperties} />
                  <span>{i + 1}.º</span>
                </div>
              ))}
            </div>
          </article>
          <article className="lo-pieza" data-revelar="blur" data-retraso="100">
            <h3>Cada pago queda a la vista</h3>
            <p>Los pagos quedan en la red de Stellar. Cualquiera del grupo puede revisarlos.</p>
            <div className="lo-recibos" aria-hidden="true">
              {[
                ['Carla pagó', '100 TUSD · ronda 2', nieta],
                ['Beto pagó', '100 TUSD · ronda 2', oficina1],
                ['Ana pagó', '105 TUSD · con multa', vecina],
              ].map(([t, d, c], i) => (
                <div key={t} className="lo-recibo" style={{ '--k': i } as CSSProperties}>
                  <img src={c} alt="" width={30} height={30} loading="lazy" decoding="async" />
                  <span>
                    <strong>{t}</strong>
                    <small>{d}</small>
                  </span>
                  <Visto />
                </div>
              ))}
            </div>
          </article>
          <article className="lo-pieza" data-revelar="blur">
            <h3>Si alguien falla, el grupo no pierde</h3>
            <p>Su garantía cubre la cuota que falta y la bolsa llega completa a quien le toca.</p>
            <div ref={refPulso} className="lo-pulso" aria-hidden="true">
              <span className="lo-pulso-onda" />
              <span className="lo-pulso-onda" />
              <span className="lo-pulso-onda" />
              <Orbitas
                anillos={[{ d: 190, vel: 26, astros: [0, 72, 144, 216, 288].map((a, i) => ({ a, cara: CARAS_MUESTRA[i], tam: 34 })) }]}
                className="lo-orbitas-pieza"
              />
              <span className="lo-pulso-centro">
                <Logo tam={30} />
              </span>
            </div>
          </article>
          <article className="lo-pieza ancha" data-revelar="blur" data-retraso="100">
            <h3>Tu garantía gana rendimiento</h3>
            <p>Mientras esperas tu turno, la garantía queda en una bóveda que genera rendimiento. Con TUSD es simulado para la demo; con USDC es real, en Blend.</p>
            <div className="lo-rinde" aria-hidden="true">
              <svg viewBox="0 0 160 160" className="lo-rinde-anillo">
                <circle cx="80" cy="80" r="68" className="pista" />
                <circle cx="80" cy="80" r="68" className="lleno" pathLength={100} />
                <g className="lo-rinde-punto">
                  <circle cx="148" cy="80" r="7" />
                </g>
              </svg>
              <div className="lo-rinde-texto">
                <strong>
                  {Number(colateralDeTurno(EJEMPLO, 0))} TUSD
                </strong>
                <span>garantía del turno 1, rindiendo mientras esperas</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ---------- La gente: la ronda de caras alrededor de la promesa, y las cifras del producto ---------- */
function LaGente() {
  return (
    <section className="lo-seccion gris lo-gente">
      <div className="lo-gente-escena">
        <Orbitas anillos={ANILLOS_GENTE} className="lo-orbitas-gente" />
        <div className="lo-gente-texto" data-revelar="blur">
          <p className="lo-insignia">La gente</p>
          <h2 className="lo-h2">
            <Palabras renglones={['Una tanda', 'para cada grupo.']} />
          </h2>
          <p className="lo-texto">La familia, la oficina, el barrio. Cada grupo pone sus reglas: la cuota, cuántas personas y cada cuánto se paga.</p>
        </div>
      </div>
      <div className="lo-contenedor lo-cifras">
        <Dato valor={12} texto="personas por tanda, como máximo" />
        <Dato valor={3} texto="reglas que cumple el contrato por su cuenta" />
        <figure className="lo-cifras-foto" data-revelar="blur">
          <img src={fotoFamilia} alt="Una abuela y su nieta miran un celular en la mesa de la cocina." width={640} height={640} loading="lazy" decoding="async" />
          <figcaption>Foto ilustrativa hecha con IA.</figcaption>
        </figure>
        <Dato valor={100} sufijo=" %" texto="de tu garantía vuelve al final si cumples" />
        <Dato valor={0} texto="contraseñas que recordar: entras con Freighter o con Google" />
      </div>
    </section>
  )
}

function Dato({ valor, sufijo = '', texto }: { valor: number; sufijo?: string; texto: string }) {
  return (
    <div className="lo-dato" data-revelar="blur">
      <span className="lo-dato-icono" aria-hidden="true">
        <Logo tam={14} />
      </span>
      <strong>
        <Contador valor={valor} sufijo={sufijo} />
      </strong>
      <span>{texto}</span>
    </div>
  )
}

/* ---------- Ritmos: dos ejemplos de verdad, como los planes de las plantillas de Framer ---------- */
function Ritmos() {
  return (
    <section id="ritmo" className="lo-seccion">
      <div className="lo-contenedor">
        <Encabezado
          insignia="Arma la tuya"
          titulo={['Al ritmo', 'de tu grupo.']}
          texto="Dos ejemplos para empezar. En la app eliges la cuota, cuántas personas y cada cuánto se paga."
        />
        <div className="lo-ritmos">
          {RITMOS.map((r, i) => {
            const p = { cuota: r.cuota, nMiembros: r.n, coberturaBps: COBERTURA }
            return (
              <article key={r.nombre} className={i === 0 ? 'lo-ritmo oscuro' : 'lo-ritmo'} data-revelar="blur" data-retraso={i * 120}>
                {i === 0 && (
                  <Orbitas anillos={[{ d: 420, vel: 50, astros: [{ a: 40 }, { a: 200 }] }, { d: 640, vel: 80, contra: true, astros: [{ a: 120 }] }]} className="lo-orbitas-ritmo" />
                )}
                <p className="lo-ritmo-nombre">{r.nombre}</p>
                <p className="lo-ritmo-detalle">{r.detalle}</p>
                <p className="lo-ritmo-monto">
                  <strong>{Number(bolsa(p))}</strong> TUSD de bolsa
                </p>
                <ul>
                  <li>Cuota de {Number(r.cuota)} TUSD</li>
                  <li>{r.n} personas</li>
                  <li>Garantía del primer turno: {Number(colateralDeTurno(p, 0))} TUSD</li>
                  <li>Garantía del último turno: {Number(colateralDeTurno(p, r.n - 1))} TUSD</li>
                  <li>Multa por atraso: {r.multa} %</li>
                </ul>
                <a className={i === 0 ? 'lo-boton blanco ancho' : 'lo-boton azul ancho'} href={RUTA_CREAR}>
                  Crear una tanda así
                </a>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------- Preguntas ---------- */
function Preguntas() {
  const google = useSesionGoogle()
  const lista = [
    {
      p: '¿Qué es una tanda?',
      r: 'Un grupo pone la misma cuota cada ronda y, por turnos, una persona se lleva toda la bolsa. Al final, todos pusieron lo mismo y todos cobraron una vez.',
    },
    {
      p: '¿Qué pasa si alguien deja de pagar?',
      r: 'Su garantía cubre la cuota que falta, así que la bolsa llega completa a quien le toca. Por eso quien cobra primero deja más garantía.',
    },
    {
      p: '¿De dónde sale el rendimiento?',
      r: 'Mientras esperas tu turno, la garantía queda en una bóveda que genera rendimiento. Con TUSD es simulado y acelerado para la demo; con USDC es real, en Blend.',
    },
    {
      p: '¿Necesito saber de cripto?',
      r: google
        ? 'No. Entras con tu cuenta de Google y te creamos una billetera de prueba. Si ya usas Freighter, también sirve.'
        : 'No. Entras con Freighter, la billetera de Stellar para el navegador, y la app te guía paso a paso.',
    },
    {
      p: '¿Es dinero real?',
      r: 'No. Todo corre en la red de pruebas de Stellar con dinero de prueba, que se pide gratis dentro de la app.',
    },
    { p: '¿Cuántas personas pueden entrar?', r: 'De 3 a 12 por tanda. Cada persona es un turno: una tanda de 6 personas dura 6 rondas.' },
  ]
  const [abierta, setAbierta] = useState(0)
  return (
    <section id="preguntas" className="lo-seccion gris">
      <div className="lo-contenedor">
        <Encabezado insignia="Preguntas" titulo={['Lo que todos', 'preguntan.']} centrado />
        <div className="lo-preguntas">
          {lista.map((x, i) => {
            const abre = abierta === i
            return (
              <div key={x.p} className={abre ? 'lo-pregunta abierta' : 'lo-pregunta'} data-revelar="blur" data-retraso={i * 60}>
                <h3>
                  <button aria-expanded={abre} aria-controls={`lo-r-${i}`} id={`lo-p-${i}`} onClick={() => setAbierta(abre ? -1 : i)}>
                    {x.p}
                    <span className="lo-mas" aria-hidden="true" />
                  </button>
                </h3>
                <div id={`lo-r-${i}`} role="region" aria-labelledby={`lo-p-${i}`} className="lo-respuesta">
                  <div>
                    <p>{x.r}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------- Cierre ---------- */
function Cierre() {
  const google = useSesionGoogle()
  return (
    <section className="lo-seccion lo-cierre-seccion">
      <div className="lo-cierre" data-revelar="blur">
        <Orbitas anillos={ANILLOS_CIERRE} className="lo-orbitas-cierre" />
        <p className="lo-insignia vidrio">Empieza hoy</p>
        <h2 className="lo-h2">
          <Palabras renglones={['¿Arrancamos tu', 'primera tanda?']} />
        </h2>
        <p className="lo-cierre-texto">
          {google
            ? 'Entras con tu cuenta de Google y te creamos una billetera de prueba. Si ya usas Freighter, también sirve.'
            : 'Necesitas Freighter, la billetera de Stellar para el navegador, puesta en Testnet. Los TUSD de prueba se piden gratis dentro de la app.'}
        </p>
        <div className="lo-acciones">
          <a className="lo-boton blanco" href={RUTA_LOBBY}>
            Abrir la app
          </a>
          <a className="lo-boton vidrio" href={RUTA_DEMO}>
            Ver la demo en vivo
          </a>
        </div>
      </div>
    </section>
  )
}

function Pie() {
  return (
    <footer className="lo-pie">
      <div className="lo-contenedor lo-pie-rejilla">
        <div className="lo-pie-marca">
          <p>
            <Logo tam={20} />
            Rounda
          </p>
          <p>Tandas con contrato inteligente en Stellar. Todo corre en la red de pruebas, con dinero de prueba.</p>
        </div>
        <nav aria-label="La app">
          <p>La app</p>
          <a href={RUTA_LOBBY}>Tandas</a>
          <a href={RUTA_CREAR}>Crear una tanda</a>
          <a href={RUTA_DEMO}>Demo en vivo</a>
          <a href={RUTA_ESTADO}>Estado</a>
        </nav>
        <nav aria-label="El proyecto">
          <p>El proyecto</p>
          {TANDA_ID && (
            <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
              El contrato en el explorador
            </a>
          )}
          <a href={RUTA_INICIO} onClick={irASeccion('como')}>
            Cómo funciona
          </a>
          <a href={RUTA_INICIO} onClick={irASeccion('preguntas')}>
            Preguntas
          </a>
        </nav>
      </div>
      <div className="lo-contenedor lo-pie-base">
        <span>Fotos ilustrativas hechas con IA.</span>
        <span>Hecho en Costa Rica.</span>
      </div>
    </footer>
  )
}

/* ---------- Detalles ---------- */
function Visto() {
  return (
    <svg className="lo-visto" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" />
      <path d="M5.8 10.3l2.7 2.7 5.6-6" />
    </svg>
  )
}

/** Un anillo chico que se llena (cuántos pagaron). */
function Anillito({ parte, oscuro = false }: { parte: number; oscuro?: boolean }) {
  return (
    <svg className={oscuro ? 'lo-anillito oscuro' : 'lo-anillito'} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="14" className="pista" />
      <circle cx="18" cy="18" r="14" className="lleno" pathLength={100} style={{ strokeDashoffset: 100 - parte * 100 }} />
    </svg>
  )
}
