// Cuánto recibió cada persona al terminar la tanda.
// El contrato solo lo anuncia con eventos, así que los leemos de la red (que los guarda un tiempo limitado).
import type { DatosTanda } from '../hooks/useTanda'
import type { EventoTanda } from '../lib/historia'
import { resultadosDesdeEventos } from '../lib/rpc'
import { dinero } from '../lib/glosario'
import { direccionCorta, nombreDe, NOMBRES } from '../lib/nombres'
import { EXPLORADOR, TANDA_ID } from '../config'

type Props = {
  datos: DatosTanda
  yo: string | null
  /** Eventos de la tanda (null = todavía leyendo). Los lee quien usa este componente. */
  eventos: EventoTanda[] | null
  error: boolean
}

export function Resultados({ datos, yo, eventos, error }: Props) {
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
          Ya no encontramos el detalle de los pagos finales: la red solo guarda el detalle durante unos días.
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
                <dt>Intereses ganados</dt>
                <dd>
                  {r.rendimiento >= 0n ? '+' : ''}
                  {dinero(r.rendimiento)}
                </dd>
              </div>
            )}
            {r.fondoPremios !== null && (
              <div className="dato">
                <dt>Multas repartidas</dt>
                <dd>
                  {dinero(r.fondoPremios)}
                </dd>
              </div>
            )}
            {r.retenido !== null && r.retenido > 0n && (
              <div className="dato">
                <dt>Pozos guardados</dt>
                <dd>
                  {dinero(r.retenido)}
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
                    Depósito
                  </th>
                  <th scope="col" className="num">
                    Recibió al final
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
                      <td className="num">{dinero(m.colateral_inicial)}</td>
                      <td className="num">{hayPagos ? dinero(final) : '-'}</td>
                      <td>{hayPagos ? comoLeFue(m, final) : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="explica">
            "Recibió al final" es lo que se le devolvió al terminar: lo que sobró de su depósito, su parte de los intereses
            y, si nunca se atrasó, su parte de las multas. El pozo de cada turno se entregó antes.
          </p>
        </>
      )}
    </section>
  )
}

function comoLeFue(m: DatosTanda['miembros'][number], final: bigint): string {
  if (m.moroso) return `Quedó debiendo ${dinero(m.deuda)}`
  if (m.colateral_inicial > 0n && final === 0n) return 'Su depósito cubrió sus cuotas'
  if (m.atrasos === 0) return 'Siempre pagó a tiempo'
  return m.atrasos === 1 ? '1 atraso' : `${m.atrasos} atrasos`
}
