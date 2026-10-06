// La "rueda" de la tanda: cada persona es un punto del círculo, en orden de turno.
// - Relleno amarillo: a quien le toca cobrar esta ronda.
// - Anillo verde: ya pagó la cuota de esta ronda.
// - Marca ✓: ya cobró su bolsa.
// - El arco interior es el tiempo que le queda a la ronda.
import type { CSSProperties } from 'react'
import type { DatosTanda, MiembroConDireccion } from '../hooks/useTanda'
import { monto, duracion } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { tieneTurno } from '../lib/turnos'
import { useSimbolo } from '../hooks/useMoneda'

type Props = { datos: DatosTanda; ahora: number; yo: string | null }

const CX = 200
const CY = 178
const R = 118 // radio donde van las personas
const R_TIEMPO = 80 // radio del arco de tiempo
const CIRC_TIEMPO = 2 * Math.PI * R_TIEMPO

export function Rueda({ datos, ahora, yo }: Props) {
  const { tanda, miembros, pagaron, vence } = datos
  const n = tanda.n_miembros
  const estado = tanda.estado.tag
  const activa = estado === 'Activa'

  // (M3) Quien todavía no tiene turno (sorteo antes de llenarse, subasta) ocupa un asiento libre, marcado con "?".
  const sinTurno = miembros.filter((m) => !tieneTurno(m.posicion))
  let k = 0
  const asientos: (MiembroConDireccion | null)[] = Array.from(
    { length: n },
    (_, i) => miembros.find((m) => m.posicion === i) ?? sinTurno[k++] ?? null,
  )
  // En la subasta, quien cobra la ronda no se sabe hasta cerrarla: el asiento puede ser de alguien sin turno.
  const enTurno = activa ? asientos[tanda.ronda_actual] : null
  const beneficiario = enTurno !== null && enTurno.posicion === tanda.ronda_actual ? enTurno : null

  const puntos = asientos.map((_, i) => {
    const ang = ((-90 + (i * 360) / n) * Math.PI) / 180
    const x = CX + R * Math.cos(ang)
    const y = CY + R * Math.sin(ang)
    const arriba = Math.sin(ang) < -0.2
    return { x, y, yNombre: arriba ? y - 38 : y + 50 }
  })
  const yMin = Math.min(...puntos.map((p) => Math.min(p.y - 34, p.yNombre - 18)))
  const yMax = Math.max(...puntos.map((p) => Math.max(p.y + 34, p.yNombre + 8)))

  const periodo = Number(tanda.periodo_seg)
  const restante = vence - ahora
  const vencida = activa && restante <= 0
  const fraccionRestante = activa ? Math.min(1, Math.max(0, restante / periodo)) : 0

  return (
    <figure className="rueda">
      <svg viewBox={`0 ${yMin} 400 ${yMax - yMin}`} role="img" aria-label={resumen(datos, restante)}>
        <circle className="rueda-pista" cx={CX} cy={CY} r={R} />

        {activa && (
          <circle
            className={vencida ? 'rueda-tiempo vencida' : 'rueda-tiempo'}
            cx={CX}
            cy={CY}
            r={R_TIEMPO}
            strokeDasharray={CIRC_TIEMPO}
            strokeDashoffset={vencida ? 0 : CIRC_TIEMPO * (1 - fraccionRestante)}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        )}

        <Centro datos={datos} beneficiario={beneficiario} restante={restante} />

        {asientos.map((m, i) => {
          const { x, y, yNombre } = puntos[i]
          const pago = m !== null && pagaron.includes(m.direccion)
          const turno = beneficiario !== null && i === tanda.ronda_actual
          const clases = [
            'nodo',
            m === null && 'libre',
            turno && 'turno',
            pago && 'pago',
            m?.moroso && 'moroso',
            m !== null && m.direccion === yo && 'yo',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <g key={i} className={clases} style={{ '--i': i } as CSSProperties}>
              {turno && <circle className="nodo-halo" cx={x} cy={y} r={27} />}
              {pago && <circle className="nodo-anillo" cx={x} cy={y} r={31} />}
              <circle className="nodo-punto" cx={x} cy={y} r={24} />
              <text className="nodo-turno" x={x} y={y + 6}>
                {m !== null && !tieneTurno(m.posicion) ? '?' : i + 1}
              </text>
              {m?.cobro && (
                <g className="nodo-cobro">
                  <circle cx={x + 19} cy={y - 19} r={10} />
                  <text x={x + 19} y={y - 15}>
                    ✓
                  </text>
                </g>
              )}
              <text className="nodo-nombre" x={x} y={yNombre}>
                {m === null ? 'Libre' : m.direccion === yo ? `${nombreDe(m.direccion)} (tú)` : nombreDe(m.direccion)}
              </text>
            </g>
          )
        })}
      </svg>

      {estado !== 'Abierta' && (
      <figcaption className="leyenda">
        <span><i className="muestra turno" /> Le toca cobrar</span>
        <span><i className="muestra pago" /> Pagó esta ronda</span>
        <span><i className="muestra cobro">✓</i> Ya cobró</span>
      </figcaption>
      )}
    </figure>
  )
}

function Centro({
  datos,
  beneficiario,
  restante,
}: {
  datos: DatosTanda
  beneficiario: MiembroConDireccion | null
  restante: number
}) {
  const SIMBOLO = useSimbolo()
  const { tanda, miembros } = datos
  const n = tanda.n_miembros
  const bolsa = tanda.cuota * BigInt(n)

  let lineas: { texto: string; clase: string }[]
  switch (tanda.estado.tag) {
    case 'Abierta':
      lineas = [
        { texto: `${miembros.length} de ${n}`, clase: 'centro-grande' },
        { texto: 'personas unidas', clase: 'centro-sub' },
      ]
      break
    case 'Activa':
      lineas = [
        { texto: monto(bolsa), clase: 'centro-grande' },
        {
          texto: beneficiario ? `${SIMBOLO} para ${nombreDe(beneficiario.direccion)}` : `${SIMBOLO} en juego`,
          clase: 'centro-sub',
        },
        {
          texto: restante > 0 ? `Quedan ${duracion(restante)}` : 'Plazo vencido',
          clase: restante > 0 ? 'centro-nota' : 'centro-nota alerta',
        },
      ]
      break
    case 'PorLiquidar':
      lineas = [
        { texto: 'Rondas listas', clase: 'centro-medio' },
        { texto: 'Falta repartir', clase: 'centro-sub' },
        { texto: 'el dinero final', clase: 'centro-sub' },
      ]
      break
    case 'Finalizada':
      lineas = [
        { texto: 'Terminada', clase: 'centro-medio' },
        { texto: 'Todos recibieron', clase: 'centro-sub' },
        { texto: 'su parte', clase: 'centro-sub' },
      ]
      break
    default:
      lineas = [{ texto: 'Cancelada', clase: 'centro-medio' }]
  }

  const y0 = CY - 18
  return (
    <g className="centro">
      {lineas.map((l, i) => (
        <text key={i} className={l.clase} x={CX} y={y0 + i * 26 + (i > 0 ? 6 : 0)}>
          {l.texto}
        </text>
      ))}
    </g>
  )
}

function resumen(datos: DatosTanda, restante: number): string {
  const { tanda, miembros, pagaron } = datos
  const base = `Tanda de ${tanda.n_miembros} personas, ${miembros.length} unidas.`
  if (tanda.estado.tag !== 'Activa') return base
  return `${base} Ronda ${tanda.ronda_actual + 1}. Pagaron ${pagaron.length}. ${
    restante > 0 ? `Quedan ${duracion(restante)}.` : 'El plazo venció.'
  }`
}
