// Una tanda en el lobby: lo justo para decidir si entrar (pozo, cupos, cuota, depósito).
import type { CSSProperties } from 'react'
import type { ResumenTanda } from '../lib/lectura'
import { bolsa, colateralDeTurno } from '../lib/colateral'
import { claseEstado, etiquetaEstado } from '../lib/formato'
import { dinero } from '../lib/glosario'
import { porPeriodo } from '../lib/resumen'
import { rutaTanda } from '../lib/rutas'
import { bolsaListaParaCobrar } from '../lib/cobro'
import { tituloModo } from '../lib/turnos'

type Props = {
  resumen: ResumenTanda
  yo: string | null
  /** Segundos Unix actuales (para avisar si la bolsa de quien está conectado ya se puede cobrar). */
  ahora: number
}

export function TarjetaTanda({ resumen, yo, ahora }: Props) {
  const { id, tanda, miembros, modo } = resumen
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
          ? `Entras con ${dinero(tanda.cuota)} de depósito (${modo === 'Sorteo' ? 'el orden se sortea' : 'los turnos se subastan'})`
          : modo === 'Eleccion' || modo === 'PrecioPorTurno'
            ? 'Eliges tu turno al entrar'
            : `Entras con ${dinero(colateralDeTurno(params, miembros.length))} de depósito (turno ${miembros.length + 1})`
  } else if (estado === 'Activa') {
    detalle = `Turno ${tanda.ronda_actual + 1} de ${n}`
  } else if (estado === 'PorLiquidar') {
    detalle = 'Falta repartir el dinero final'
  } else if (estado === 'Finalizada') {
    detalle = 'Todos recibieron su parte'
  } else {
    detalle = 'Se devolvieron los depósitos'
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
            {dinero(bolsa({ cuota: tanda.cuota, nMiembros: n }))}
          </strong>{' '}
          de pozo
        </p>

        <div className="lugares" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={i < miembros.length ? 'lugar lleno' : 'lugar'} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <p className="tarjeta-datos">
          {miembros.length} de {n} personas · {dinero(tanda.cuota)} {porPeriodo(Number(tanda.periodo_seg))}
        </p>
        <p className="tarjeta-detalle">{detalle}</p>
        {modo !== 'Llegada' && <p className="tarjeta-datos">Turnos: {tituloModo(modo).toLowerCase()}</p>}

        {(participo || creada) && (
          <p className="tarjeta-pie">
            {participo && <span className="marca-yo">Participas</span>}
            {creada && <span className="marca-yo">La creaste tú</span>}
          </p>
        )}
        {/* M1: a quien le toca cobrar, su pozo lo espera (al cobrarlo empieza el turno siguiente). */}
        {bolsaListaParaCobrar(tanda, miembros, yo, ahora) && <p className="tarjeta-cobro">Tu pozo está listo: cóbralo</p>}
      </a>
    </li>
  )
}
