// Tabla con cada participante: su turno, su garantía y cómo va.
import type { DatosTanda } from '../hooks/useTanda'
import { monto } from '../lib/formato'
import { saldoSuDeuda } from '../lib/deudas'
import { direccionCorta, nombreDe, NOMBRES } from '../lib/nombres'
import { EXPLORADOR } from '../config'
import { tieneTurno, turnosLibres } from '../lib/turnos'
import { InsigniaNivel } from './InsigniaNivel'
import { useSimbolo } from '../hooks/useMoneda'

type Props = { datos: DatosTanda; yo: string | null }

export function ListaMiembros({ datos, yo }: Props) {
  const SIMBOLO = useSimbolo()
  const { tanda, miembros, pagaron } = datos
  const activa = tanda.estado.tag === 'Activa'
  const libres = tanda.n_miembros - miembros.length
  // (M3) Con turnos elegidos, los lugares libres no son necesariamente los últimos.
  const turnosSinDuenio = turnosLibres(
    tanda.n_miembros,
    miembros.map((m) => m.posicion),
  )
  const hayPorDecidir = miembros.some((m) => !tieneTurno(m.posicion))

  return (
    <section className="miembros" aria-labelledby="miembros-titulo">
      <h2 id="miembros-titulo">Quiénes participan</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Turno</th>
              <th scope="col">Persona</th>
              <th scope="col" className="num">Garantía ({SIMBOLO})</th>
              {activa && <th scope="col">Esta ronda</th>}
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => {
              const pago = pagaron.includes(m.direccion)
              const usada = m.colateral !== m.colateral_inicial
              return (
                <tr key={m.direccion} className={m.direccion === yo ? 'fila-yo' : undefined}>
                  <td className="turno">{tieneTurno(m.posicion) ? m.posicion + 1 : '?'}</td>
                  <td>
                    <a href={`${EXPLORADOR}/account/${m.direccion}`} target="_blank" rel="noreferrer" title={m.direccion}>
                      {nombreDe(m.direccion)}
                    </a>
                    <InsigniaNivel dir={m.direccion} />
                    {m.direccion === yo && <span className="marca-yo">tú</span>}
                    {NOMBRES[m.direccion] && <span className="dir">{direccionCorta(m.direccion)}</span>}
                  </td>
                  <td className="num">
                    {monto(m.colateral)}
                    {usada && <span className="sub"> de {monto(m.colateral_inicial)}</span>}
                  </td>
                  {activa && (
                    <td>
                      <span className={pago ? 'estado ok' : 'estado pendiente'}>
                        {pago ? 'Pagó' : m.moroso ? 'No puede pagar' : 'Pendiente'}
                      </span>
                    </td>
                  )}
                  <td>
                    {estadoMiembro(m, activa, tanda.ronda_actual, SIMBOLO)}
                    {saldoSuDeuda(
                      datos.deudas.find((d) => d.direccion === m.direccion),
                      m.moroso,
                    ) && <span className="sub saldo-deuda">Saldó su deuda</span>}
                    {m.atrasos > 0 && (
                      <span className="sub atraso">
                        {m.atrasos === 1 ? '1 atraso' : `${m.atrasos} atrasos`}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {Array.from({ length: libres }, (_, i) => (
              <tr key={`libre-${i}`} className="fila-libre">
                <td className="turno">{hayPorDecidir ? '?' : (turnosSinDuenio[i] ?? miembros.length + i) + 1}</td>
                <td colSpan={activa ? 4 : 3}>Lugar libre</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function estadoMiembro(
  m: { posicion: number; cobro: boolean; moroso: boolean; deuda: bigint },
  activa: boolean,
  ronda: number,
  SIMBOLO: string,
): string {
  if (m.moroso) return `Debe ${monto(m.deuda)} ${SIMBOLO}`
  if (m.cobro) return 'Ya cobró'
  if (!tieneTurno(m.posicion)) return 'Turno por decidir'
  if (activa && m.posicion === ronda) return 'Cobra esta ronda'
  return `Cobra en la ronda ${m.posicion + 1}`
}
