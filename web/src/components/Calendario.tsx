// Calendario de la tanda (misión M1): quién cobra en cada ronda y cuándo vence. El contrato ancla las
// fechas (cada ronda vence un periodo después de la anterior), así que las futuras no se corren aunque
// una ronda se cierre tarde. Solo para rondas de un día o más: en una demo de minutos sobra.
// Quien participa puede bajar las fechas a su calendario (.ics, con recordatorios): ver lib/calendarioIcs.ts.
import type { DatosTanda } from '../hooks/useTanda'
import { generarIcs } from '../lib/calendarioIcs'
import { cuando } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { rutaTanda } from '../lib/rutas'
import { TANDA_ID } from '../config'
import { useSimbolo } from '../hooks/useMoneda'

const DIA = 86_400

type Props = {
  id: number
  datos: DatosTanda
  ahora: number
  /** Dirección conectada (null si no hay billetera). */
  yo: string | null
}

export function Calendario({ id, datos, ahora, yo }: Props) {
  const SIMBOLO = useSimbolo()
  const { tanda, miembros, vence } = datos
  const periodo = Number(tanda.periodo_seg)
  if (tanda.estado.tag !== 'Activa' || periodo < DIA) return null
  const mio = miembros.find((m) => m.direccion === yo) ?? null

  function descargar() {
    const quien = (r: number) => miembros.find((m) => m.posicion === r)
    const ics = generarIcs(
      {
        id,
        contrato: TANDA_ID,
        nMiembros: tanda.n_miembros,
        rondaActual: tanda.ronda_actual,
        periodoSeg: periodo,
        vence,
        cuota: tanda.cuota,
        simbolo: SIMBOLO,
        cobra: Array.from({ length: tanda.n_miembros }, (_, r) => {
          const m = quien(r)
          return m ? (m.direccion === yo ? 'tú' : nombreDe(m.direccion)) : null
        }),
        miRonda: mio && !mio.cobro && mio.posicion < tanda.n_miembros ? mio.posicion : null,
        enlace: `${window.location.origin}${window.location.pathname}${rutaTanda(id)}`,
      },
      Math.floor(Date.now() / 1000),
    )
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rounda-tanda-${id}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }

  const filas = Array.from({ length: tanda.n_miembros }, (_, r) => {
    const quien = miembros.find((m) => m.posicion === r)
    const nombre = quien ? nombreDe(quien.direccion) : '-'
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
      {mio && (
        <div className="agregar-calendario">
          <button type="button" className="boton chico" onClick={descargar}>
            Agregar a mi calendario
          </button>
          <p className="explica">
            Baja las fechas de pago que faltan a tu calendario (el del teléfono o Google Calendar), con un recordatorio
            un día antes.
          </p>
        </div>
      )}
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
