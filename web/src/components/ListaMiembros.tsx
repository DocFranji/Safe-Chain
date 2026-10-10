// Quiénes participan, como en el celular de la portada (diseño Órbita): una píldora por persona, con su inicial,
// su nombre, su turno y depósito debajo, y a la derecha cómo va ("Pagó", "Por pagar", "Debe $100"...).
// Arriba, la línea del turno: "Turno 2 de 3 · Cobra Beto".
import type { DatosTanda } from '../hooks/useTanda'
import { usePagosPendientes } from '../hooks/useMora'
import { dinero } from '../lib/glosario'
import { saldoSuDeuda } from '../lib/deudas'
import { nombreDe } from '../lib/nombres'
import { rutaHistorial } from '../lib/rutas'
import { tieneTurno, turnosLibres } from '../lib/turnos'
import { InsigniaNivel } from './InsigniaNivel'
import './mora.css'

type Props = { datos: DatosTanda; yo: string | null }

export function ListaMiembros({ datos, yo }: Props) {
  const { tanda, miembros, pagaron } = datos
  const estado = tanda.estado.tag
  const activa = estado === 'Activa'
  // Pedido 4 del plan v5: mientras la tanda sigue, quien tiene un pago pendiente en otra tanda lleva una marca.
  // Quien ya debe en ESTA tanda no la lleva: a su derecha ya dice "Debe $…".
  const conMora = usePagosPendientes()
  const marcarMora = estado === 'Abierta' || activa || estado === 'PorLiquidar'
  const libres = tanda.n_miembros - miembros.length
  // (M3) Con turnos elegidos, los lugares libres no son necesariamente los últimos.
  const turnosSinDuenio = turnosLibres(
    tanda.n_miembros,
    miembros.map((m) => m.posicion),
  )
  const hayPorDecidir = miembros.some((m) => !tieneTurno(m.posicion))
  const cobra = activa ? miembros.find((m) => m.posicion === tanda.ronda_actual) : undefined
  // Ordenadas por turno, como en la rueda (quien no tiene turno todavía, al final).
  const ordenados = [...miembros].sort((a, b) => a.posicion - b.posicion)

  const [titulo, lado] =
    estado === 'Activa'
      ? [`Turno ${tanda.ronda_actual + 1} de ${tanda.n_miembros}`, cobra ? `Cobra ${cobra.direccion === yo ? 'tú' : nombreDe(cobra.direccion)}` : '']
      : estado === 'Abierta'
        ? ['Quiénes participan', `${miembros.length} de ${tanda.n_miembros}`]
        : ['Quiénes participan', '']

  return (
    <section className="miembros" aria-labelledby="miembros-titulo">
      <div className="ronda-linea">
        <h2 id="miembros-titulo">{titulo}</h2>
        {lado && <span>{lado}</span>}
      </div>
      <ul className="lista-personas">
        {ordenados.map((m) => {
          const pago = pagaron.includes(m.direccion)
          const usada = m.colateral !== m.colateral_inicial
          const nombre = nombreDe(m.direccion)
          const clases = ['persona', activa && pago && 'pago', m.direccion === yo && 'yo', cobra?.direccion === m.direccion && 'cobra']
            .filter(Boolean)
            .join(' ')
          return (
            <li key={m.direccion} className={clases}>
              <span className="persona-inicial" aria-hidden="true">
                {inicial(nombre)}
              </span>
              <span className="persona-cuerpo">
                <span className="persona-nombre">
                  {/* El nombre lleva a la reputación de la persona, no al explorador de la red. */}
                  <a href={rutaHistorial(m.direccion)} title={m.direccion}>
                    {nombre}
                  </a>
                  <InsigniaNivel dir={m.direccion} />
                  {m.direccion === yo && <span className="marca-yo">tú</span>}
                </span>
                <span className="sub">
                  {[
                    tieneTurno(m.posicion) ? `Turno ${m.posicion + 1}` : 'Turno por decidir',
                    `depósito ${dinero(m.colateral)}${usada ? ` de ${dinero(m.colateral_inicial)}` : ''}`,
                    m.atrasos > 0 ? (m.atrasos === 1 ? '1 atraso' : `${m.atrasos} atrasos`) : null,
                    saldoSuDeuda(
                      datos.deudas.find((d) => d.direccion === m.direccion),
                      m.moroso,
                    )
                      ? 'se puso al día'
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {marcarMora && !m.moroso && conMora.has(m.direccion) && (
                  <span className="marca-mora">Pago pendiente en otra tanda</span>
                )}
              </span>
              <em className="persona-estado">{estadoMiembro(m, estado, pago)}</em>
            </li>
          )
        })}
        {Array.from({ length: libres }, (_, i) => (
          <li key={`libre-${i}`} className="persona libre">
            <span className="persona-inicial" aria-hidden="true">
              +
            </span>
            <span className="persona-cuerpo">
              <span className="persona-nombre">Lugar libre</span>
              {!hayPorDecidir && <span className="sub">Turno {(turnosSinDuenio[i] ?? miembros.length + i) + 1}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Ana" -> "A" · "Doña Ana" -> "D" · "GADM…TVPD" -> "G". */
function inicial(nombre: string): string {
  return (nombre.trim()[0] ?? '?').toUpperCase()
}

/** A la derecha de cada persona: cómo va en este momento. */
function estadoMiembro(
  m: { posicion: number; cobro: boolean; moroso: boolean; deuda: bigint },
  estado: string,
  pago: boolean,
): string {
  if (m.moroso) return `Debe ${dinero(m.deuda)}`
  if (estado === 'Activa') return pago ? 'Pagó' : 'Por pagar'
  if (estado === 'Abierta') return 'Unido'
  return m.cobro ? 'Ya cobró' : '-'
}
