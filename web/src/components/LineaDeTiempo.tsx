// La historia de la tanda en frases: quién se unió, quién pagó, a quién le cubrió la garantía...
// Los momentos "clave" (la garantía cubriendo a quien no pagó) se destacan.
import type { EventoTanda } from '../lib/historia'
import { narrar } from '../lib/historia'
import { monto } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { SIMBOLO } from '../config'

type Props = {
  /** null = todavía leyendo. */
  eventos: EventoTanda[] | null
  error: boolean
  /** Más reciente primero (para proyectar) o en orden cronológico. */
  recientePrimero?: boolean
  /** Cuántas entradas mostrar como máximo (las más recientes). */
  limite?: number
}

const formato = { nombre: nombreDe, monto, simbolo: SIMBOLO }

function hora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function LineaDeTiempo({ eventos, error, recientePrimero = true, limite }: Props) {
  if (eventos === null) {
    return <p className="explica">{error ? 'No pudimos leer la historia ahora mismo.' : 'Leyendo la historia desde la red…'}</p>
  }
  if (eventos.length === 0) {
    return (
      <p className="explica">
        {error
          ? 'No pudimos leer la historia ahora mismo.'
          : 'Todavía no hay movimientos, o la red ya no conserva el historial de esta tanda (solo guarda los eventos unos días).'}
      </p>
    )
  }

  let entradas = narrar(eventos, formato)
  if (limite !== undefined) entradas = entradas.slice(-limite)
  if (recientePrimero) entradas = entradas.reverse()

  return (
    <ol className="historia">
      {entradas.map((e) => (
        <li key={e.id} className={`historia-item ${e.tipo}`}>
          <time dateTime={e.cerradoEn}>{hora(e.cerradoEn)}</time>
          <div>
            <p className="historia-titulo">{e.titulo}</p>
            {e.detalle && <p className="historia-detalle">{e.detalle}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
