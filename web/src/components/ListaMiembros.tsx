// Tabla con cada participante: su turno, su depósito de seguridad y cómo va.
import type { DatosTanda } from '../hooks/useTanda'
import { dinero } from '../lib/glosario'
import { saldoSuDeuda } from '../lib/deudas'
import { direccionCorta, nombreDe, NOMBRES } from '../lib/nombres'
import { EXPLORADOR } from '../config'
import { tieneTurno, turnosLibres } from '../lib/turnos'
import { InsigniaNivel } from './InsigniaNivel'

type Props = { datos: DatosTanda; yo: string | null }

export function ListaMiembros({ datos, yo }: Props) {
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
              <th scope="col" className="num">Depósito</th>
              {activa && <th scope="col">Este turno</th>}
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
                    {dinero(m.colateral)}
                    {usada && <span className="sub"> de {dinero(m.colateral_inicial)}</span>}
                  </td>
                  {activa && (
                    <td>
                      <span className={pago ? 'estado ok' : 'estado pendiente'}>
                        {pago ? 'Pagó' : m.moroso ? 'Debe un pago' : 'Falta pagar'}
                      </span>
                    </td>
                  )}
                  <td>
                    {estadoMiembro(m, activa, tanda.ronda_actual)}
                    {saldoSuDeuda(
                      datos.deudas.find((d) => d.direccion === m.direccion),
                      m.moroso,
                    ) && <span className="sub saldo-deuda">Se puso al día</span>}
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
): string {
  if (m.moroso) return `Debe ${dinero(m.deuda)}`
  if (m.cobro) return 'Ya cobró'
  if (!tieneTurno(m.posicion)) return 'Turno por decidir'
  if (activa && m.posicion === ronda) return 'Cobra en este turno'
  return `Cobra en el turno ${m.posicion + 1}`
}
