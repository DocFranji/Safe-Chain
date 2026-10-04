// Cuánto recibió cada persona al terminar la tanda.
// El contrato solo lo anuncia con eventos, así que los leemos de la red (que los guarda un tiempo limitado).
import type { DatosTanda } from '../hooks/useTanda'
import type { EventoTanda } from '../lib/historia'
import { resultadosDesdeEventos } from '../lib/rpc'
import { monto } from '../lib/formato'
import { direccionCorta, nombreDe, NOMBRES } from '../lib/nombres'
import { EXPLORADOR, TANDA_ID } from '../config'
import { useSimbolo } from '../hooks/useMoneda'

type Props = {
  datos: DatosTanda
  yo: string | null
  /** Eventos de la tanda (null = todavía leyendo). Los lee quien usa este componente. */
  eventos: EventoTanda[] | null
  error: boolean
}

export function Resultados({ datos, yo, eventos, error }: Props) {
  const SIMBOLO = useSimbolo()
  const r = eventos === null ? null : resultadosDesdeEventos(eventos)
  const recibio = new Map<string, bigint>()
  if (r) for (const p of r.pagos) recibio.set(p.miembro, p.monto)

  return (
    <section className="miembros resultados" aria-labelledby="resultados-titulo">
      <h2 id="resultados-titulo">Resultados finales</h2>

      {eventos === null && !error && <p className="cargando">Leyendo los resultados desde la red…</p>}
      {eventos === null && error && <p className="aviso error">No pudimos leer los resultados ahora mismo. Se reintentará solo.</p>}
      {eventos !== null && r === null && (
        <p className="explica">
          Ya no encontramos el detalle de los pagos finales: la red de Stellar solo conserva los eventos durante unos días.
          Puedes revisarlos en el{' '}
          <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
            explorador
          </a>
          .
        </p>
      )}

      {r !== null && (
        <>
          <dl className="datos resumen-final">
            {r.rendimiento !== null && (
              <div className="dato">
                <dt>Rendimiento generado</dt>
                <dd>
                  {r.rendimiento >= 0n ? '+' : ''}
                  {monto(r.rendimiento)} {SIMBOLO}
                </dd>
              </div>
            )}
            {r.fondoPremios !== null && (
              <div className="dato">
                <dt>Multas repartidas</dt>
                <dd>
                  {monto(r.fondoPremios)} {SIMBOLO}
                </dd>
              </div>
            )}
            {r.retenido !== null && r.retenido > 0n && (
              <div className="dato">
                <dt>Bolsas retenidas</dt>
                <dd>
                  {monto(r.retenido)} {SIMBOLO}
                </dd>
              </div>
            )}
          </dl>

          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Turno</th>
                  <th scope="col">Persona</th>
                  <th scope="col" className="num">
                    Dejó de garantía ({SIMBOLO})
                  </th>
                  <th scope="col" className="num">
                    Recibió al final ({SIMBOLO})
                  </th>
                  <th scope="col">Cómo le fue</th>
                </tr>
              </thead>
              <tbody>
                {datos.miembros.map((m) => {
                  const final = recibio.get(m.direccion) ?? 0n
                  const hayPagos = r.pagos.length > 0
                  return (
                    <tr key={m.direccion} className={m.direccion === yo ? 'fila-yo' : undefined}>
                      <td className="turno">{m.posicion + 1}</td>
                      <td>
                        {nombreDe(m.direccion)}
                        {m.direccion === yo && <span className="marca-yo">tú</span>}
                        {NOMBRES[m.direccion] && <span className="dir">{direccionCorta(m.direccion)}</span>}
                      </td>
                      <td className="num">{monto(m.colateral_inicial)}</td>
                      <td className="num">{hayPagos ? monto(final) : '—'}</td>
                      <td>{hayPagos ? comoLeFue(m, final, SIMBOLO) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="explica">
            "Recibió al final" es lo que el contrato le devolvió al repartir: su garantía que sobró, su parte del rendimiento
            y, si nunca se atrasó, su parte de las multas. Las bolsas de cada ronda se entregaron antes, al cerrar cada una.
          </p>
        </>
      )}
    </section>
  )
}

function comoLeFue(m: DatosTanda['miembros'][number], final: bigint, SIMBOLO: string): string {
  if (m.moroso) return `Quedó debiendo ${monto(m.deuda)} ${SIMBOLO}`
  if (m.colateral_inicial > 0n && final === 0n) return 'Su garantía cubrió sus cuotas'
  if (m.atrasos === 0) return 'Siempre pagó a tiempo'
  return m.atrasos === 1 ? '1 atraso' : `${m.atrasos} atrasos`
}
