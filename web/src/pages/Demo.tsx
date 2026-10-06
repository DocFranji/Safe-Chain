// "Demo en vivo": una vista pensada para PROYECTAR mientras el equipo corre una tanda.
// No necesita billetera ni tiene botones: solo cuenta lo que pasa, con letra grande y la línea de tiempo.
//   #/demo      elige sola la tanda más relevante
//   #/demo/7    se queda fija en la tanda 7 (recomendado para la presentación)
import { useAhora, useTanda, type DatosTanda } from '../hooks/useTanda'
import { useEventos } from '../hooks/useEventos'
import { useTandas } from '../hooks/useTandas'
import { Rueda } from '../components/Rueda'
import { LineaDeTiempo } from '../components/LineaDeTiempo'
import { Rendimiento } from '../components/Rendimiento'
import { Resultados } from '../components/Resultados'
import { Mensaje } from '../components/Mensaje'
import { elegirTanda, fraccionGarantia, reloj } from '../lib/demo'
import { claseEstado, etiquetaEstado, monto } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { RUTA_CREAR, RUTA_LOBBY, rutaDemo } from '../lib/rutas'
import { tieneTurno, turnosLibres } from '../lib/turnos'
import { monedaDe } from '../lib/monedas'

export function Demo({ idFijo }: { idFijo: number | null }) {
  return idFijo !== null ? <DemoTanda key={idFijo} id={idFijo} fijada /> : <DemoAutomatica />
}

/** Sin número: mira la lista y elige la tanda más relevante. */
function DemoAutomatica() {
  const { lista, listo, error } = useTandas()
  const id = elegirTanda(lista)
  if (id !== null) return <DemoTanda key={id} id={id} fijada={false} />
  return (
    <section className="demo">
      {!listo ? (
        <p className="cargando">Buscando la tanda de la demo…</p>
      ) : error ? (
        <Mensaje titulo="No pudimos leer las tandas">{error}</Mensaje>
      ) : (
        <div className="vacio">
          <h2>Todavía no hay ninguna tanda</h2>
          <p>Cuando el equipo cree la tanda de la demo, aparecerá aquí sola.</p>
          <a className="boton principal" href={RUTA_CREAR}>
            Crear una tanda
          </a>
        </div>
      )}
    </section>
  )
}

function DemoTanda({ id, fijada }: { id: number; fijada: boolean }) {
  const { datos, error, cargando } = useTanda(id)
  const ahora = useAhora()
  const historia = useEventos(id, 3000)
  const estado = datos?.tanda.estado.tag

  return (
    <section className="demo" aria-label="Demo en vivo">
      <header className="demo-cabeza">
        <h1>Tanda {id}</h1>
        {/* "En vivo" va junto al estado, no como etiqueta encima del título. */}
        <div className="demo-estado">
          <p className="demo-etiqueta">
            <span className="punto-vivo" aria-hidden="true" /> Demo en vivo
          </p>
          {estado && <span className={`etiqueta grande ${claseEstado(estado)}`}>{etiquetaEstado(estado)}</span>}
        </div>
      </header>

      {error && !datos && <Mensaje titulo="No pudimos leer esta tanda">{error}</Mensaje>}
      {cargando && !datos && !error && <p className="cargando">Leyendo la tanda desde la red de Stellar…</p>}

      {datos && (
        <>
          <div className="demo-escenario">
            <Rueda datos={datos} ahora={ahora} yo={null} />
            <div className="demo-lado">
              <Ahora datos={datos} ahora={ahora} />
              <Personas datos={datos} />
            </div>
          </div>

          {estado === 'Finalizada' && (
            <Resultados datos={datos} yo={null} eventos={historia.eventos} error={historia.error} />
          )}

          <div className={estado === 'Finalizada' ? 'demo-abajo solo' : 'demo-abajo'}>
            <section aria-labelledby="demo-pasando">
              <h2 id="demo-pasando">Qué está pasando</h2>
              <LineaDeTiempo eventos={historia.eventos} error={historia.error} limite={estado === 'Finalizada' ? 16 : 8} />
            </section>
            {estado !== 'Finalizada' && (
              <div>
                <Rendimiento datos={datos} />
              </div>
            )}
          </div>
        </>
      )}

      <p className="demo-pie">
        Pruébalo tú: <strong>{`${window.location.origin}${window.location.pathname}`}</strong>
        {' · '}
        <a href={RUTA_LOBBY}>Ver todas las tandas</a>
        {!fijada && (
          <>
            {' · '}
            <a href={rutaDemo(id)}>Fijar esta tanda</a>
          </>
        )}
      </p>
    </section>
  )
}

/** El bloque grande de la derecha: qué toca ahora, con la cuenta regresiva. */
function Ahora({ datos, ahora }: { datos: DatosTanda; ahora: number }) {
  const { tanda, miembros, vence } = datos
  const SIMBOLO = monedaDe(tanda.token).simbolo
  const n = tanda.n_miembros
  const restante = vence - ahora
  const beneficiario = miembros.find((m) => m.posicion === tanda.ronda_actual)
  const bolsa = tanda.cuota * BigInt(n)

  switch (tanda.estado.tag) {
    case 'Abierta': {
      const faltan = n - miembros.length
      return (
        <div className="demo-ahora">
          <p className="demo-grande">
            {miembros.length} de {n}
          </p>
          <p className="demo-sub">
            personas unidas{faltan > 0 ? ` · ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`} para empezar` : ''}
          </p>
        </div>
      )
    }
    case 'Activa': {
      const vencida = restante <= 0
      return (
        <div className="demo-ahora">
          <p className="demo-sub">
            Ronda {tanda.ronda_actual + 1} de {n}
          </p>
          <p className={vencida ? 'demo-reloj alerta' : 'demo-reloj'}>{vencida ? 'Plazo vencido' : reloj(restante)}</p>
          <p className="demo-sub">{vencida ? 'Falta cerrar la ronda' : 'para que venza el plazo'}</p>
          <p className="demo-cobra">
            Cobra{' '}
            <strong>
              {beneficiario
                ? nombreDe(beneficiario.direccion)
                : datos.turnos?.opciones.modo.tag === 'Subasta'
                  ? 'quien gane la subasta'
                  : '—'}
            </strong>{' '}
            · bolsa de{' '}
            <strong>
              {monto(bolsa)} {SIMBOLO}
            </strong>
          </p>
        </div>
      )
    }
    case 'PorLiquidar':
      return (
        <div className="demo-ahora">
          <p className="demo-grande">Rondas listas</p>
          <p className="demo-sub">Falta repartir el dinero final</p>
        </div>
      )
    case 'Finalizada':
      return (
        <div className="demo-ahora">
          <p className="demo-grande">Terminada</p>
          <p className="demo-sub">Todos recibieron lo que les tocaba</p>
        </div>
      )
    default:
      return (
        <div className="demo-ahora">
          <p className="demo-grande">Cancelada</p>
          <p className="demo-sub">Se devolvieron las garantías</p>
        </div>
      )
  }
}

/** Una tarjeta por persona: quién es, si ya pagó y cuánto le queda de garantía. */
function Personas({ datos }: { datos: DatosTanda }) {
  const { tanda, miembros, pagaron } = datos
  const SIMBOLO = monedaDe(tanda.token).simbolo
  const estado = tanda.estado.tag
  const activa = estado === 'Activa'
  const verGarantia = estado === 'Abierta' || activa || estado === 'PorLiquidar'
  const libres = tanda.n_miembros - miembros.length
  // (M3) Con turnos elegidos, los lugares libres no son necesariamente los últimos; en sorteo y subasta, aún no hay.
  const turnosSinDuenio = turnosLibres(
    tanda.n_miembros,
    miembros.map((m) => m.posicion),
  )
  const hayPorDecidir = miembros.some((m) => !tieneTurno(m.posicion))

  return (
    <ul className="demo-personas">
      {miembros.map((m) => {
        const pago = pagaron.includes(m.direccion)
        const cobraAhora = activa && m.posicion === tanda.ronda_actual
        let estadoTexto: string
        let estadoClase: string
        if (m.moroso) {
          estadoTexto = 'En mora'
          estadoClase = 'mora'
        } else if (activa) {
          estadoTexto = pago ? 'Pagó' : 'Por pagar'
          estadoClase = pago ? 'ok' : 'pendiente'
        } else {
          estadoTexto = m.cobro ? 'Ya cobró' : 'Espera su turno'
          estadoClase = m.cobro ? 'ok' : 'pendiente'
        }
        const fraccion = fraccionGarantia(m.colateral, m.colateral_inicial)
        return (
          <li key={m.direccion} className={`demo-persona${cobraAhora ? ' turno' : ''}${m.moroso ? ' moroso' : ''}`}>
            <div className="demo-persona-cabeza">
              <span className="demo-turno">{tieneTurno(m.posicion) ? m.posicion + 1 : '?'}</span>
              <span className="demo-nombre">{nombreDe(m.direccion)}</span>
              {cobraAhora && <span className="demo-cobra-ahora">cobra ahora</span>}
              <span className={`estado ${estadoClase}`}>{estadoTexto}</span>
            </div>
            {verGarantia && (
              <div className="demo-garantia">
                <span className="demo-garantia-barra" aria-hidden="true">
                  <i style={{ width: `${Math.round(fraccion * 100)}%` }} />
                </span>
                <span className="sub">
                  {m.colateral > m.colateral_inicial
                    ? `Garantía: ${monto(m.colateral)} ${SIMBOLO} (con dividendos de la subasta)`
                    : `Garantía: ${monto(m.colateral)} de ${monto(m.colateral_inicial)} ${SIMBOLO}`}
                </span>
              </div>
            )}
          </li>
        )
      })}
      {Array.from({ length: libres }, (_, i) => (
        <li key={`libre-${i}`} className="demo-persona libre">
          <div className="demo-persona-cabeza">
            <span className="demo-turno">{hayPorDecidir ? '?' : (turnosSinDuenio[i] ?? miembros.length + i) + 1}</span>
            <span className="demo-nombre">Lugar libre</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
