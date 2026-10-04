// Una tanda en el lobby: lo justo para decidir si entrar (bolsa, cupos, cuota, garantía).
import type { ResumenTanda } from '../lib/lectura'
import { bolsa, colateralDeTurno } from '../lib/colateral'
import { claseEstado, duracion, etiquetaEstado, monto } from '../lib/formato'
import { rutaTanda } from '../lib/rutas'
import { tituloModo } from '../lib/turnos'
import { monedaDe } from '../lib/monedas'

type Props = { resumen: ResumenTanda; yo: string | null }

export function TarjetaTanda({ resumen, yo }: Props) {
  const { id, tanda, miembros, modo } = resumen
  const SIMBOLO = monedaDe(tanda.token).simbolo
  const estado = tanda.estado.tag
  const n = tanda.n_miembros
  const params = { cuota: tanda.cuota, nMiembros: n, coberturaBps: tanda.cobertura_bps }
  const participo = yo !== null && miembros.some((m) => m.direccion === yo)
  const creada = yo !== null && tanda.creador === yo

  let detalle: string
  if (estado === 'Abierta') {
    const libres = n - miembros.length
    detalle =
      libres === 0
        ? 'Cupo completo'
        : modo === 'Sorteo' || modo === 'Subasta'
          ? `Entras con ${monto(tanda.cuota)} ${SIMBOLO} de garantía (${modo === 'Sorteo' ? 'el orden se sortea' : 'los turnos se subastan'})`
          : modo === 'Eleccion' || modo === 'PrecioPorTurno'
            ? 'Eliges tu turno al entrar'
            : `Entras con ${monto(colateralDeTurno(params, miembros.length))} ${SIMBOLO} de garantía (turno ${miembros.length + 1})`
  } else if (estado === 'Activa') {
    detalle = `Ronda ${tanda.ronda_actual + 1} de ${n}`
  } else if (estado === 'PorLiquidar') {
    detalle = 'Falta repartir el dinero final'
  } else if (estado === 'Finalizada') {
    detalle = 'Todos recibieron su parte'
  } else {
    detalle = 'Se devolvieron las garantías'
  }

  return (
    <li>
      <a className="tarjeta" href={rutaTanda(id)}>
        <div className="tarjeta-cabeza">
          <h2>Tanda {id}</h2>
          <span className={`etiqueta ${claseEstado(estado)}`}>{etiquetaEstado(estado)}</span>
        </div>

        <p className="tarjeta-bolsa">
          <strong>
            {monto(bolsa({ cuota: tanda.cuota, nMiembros: n }))} {SIMBOLO}
          </strong>{' '}
          de bolsa
        </p>

        <div className="lugares" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={i < miembros.length ? 'lugar lleno' : 'lugar'} />
          ))}
        </div>
        <p className="tarjeta-datos">
          {miembros.length} de {n} personas · cuota {monto(tanda.cuota)} {SIMBOLO} · cada{' '}
          {duracion(Number(tanda.periodo_seg))}
        </p>
        <p className="tarjeta-detalle">{detalle}</p>
        {modo !== 'Llegada' && <p className="tarjeta-datos">Turnos: {tituloModo(modo).toLowerCase()}</p>}

        {(participo || creada) && (
          <p className="tarjeta-pie">
            {participo && <span className="marca-yo">Participas</span>}
            {creada && <span className="marca-yo">La creaste tú</span>}
          </p>
        )}
      </a>
    </li>
  )
}
