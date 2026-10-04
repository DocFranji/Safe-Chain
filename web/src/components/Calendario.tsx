// Calendario de la tanda (misión M1): quién cobra en cada ronda y cuándo vence. El contrato ancla las
// fechas (cada ronda vence un periodo después de la anterior), así que las futuras no se corren aunque
// una ronda se cierre tarde. Solo para rondas de un día o más: en una demo de minutos sobra.
import type { DatosTanda } from '../hooks/useTanda'
import { cuando } from '../lib/formato'
import { nombreDe } from '../lib/nombres'

const DIA = 86_400

export function Calendario({ datos, ahora }: { datos: DatosTanda; ahora: number }) {
  const { tanda, miembros, vence } = datos
  const periodo = Number(tanda.periodo_seg)
  if (tanda.estado.tag !== 'Activa' || periodo < DIA) return null

  const filas = Array.from({ length: tanda.n_miembros }, (_, r) => {
    const quien = miembros.find((m) => m.posicion === r)
    const nombre = quien ? nombreDe(quien.direccion) : '—'
    if (r < tanda.ronda_actual) {
      return { r, nombre, cuando: quien && !quien.cobro ? 'Cerrada · bolsa retenida' : 'Cerrada · ya cobró', actual: false }
    }
    const fecha = vence + (r - tanda.ronda_actual) * periodo
    const texto = cuando(fecha, ahora)
    return { r, nombre, cuando: `Vence ${texto}`, actual: r === tanda.ronda_actual }
  })

  return (
    <section className="miembros calendario" aria-labelledby="calendario-titulo">
      <h2 id="calendario-titulo">Calendario</h2>
      <p className="explica">Las fechas de pago son fijas: aunque una ronda se cierre tarde, las siguientes no se corren.</p>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Ronda</th>
              <th scope="col">Cobra</th>
              <th scope="col">Fecha límite para pagar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.r} className={f.actual ? 'fila-yo' : undefined}>
                <td className="turno">{f.r + 1}</td>
                <td>{f.nombre}</td>
                <td>
                  {f.cuando}
                  {f.actual && <span className="sub"> · ronda en curso</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
