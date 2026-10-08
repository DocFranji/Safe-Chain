// La "rueda" de la tanda: cada persona es un lugar del círculo, en orden de turno.
// Hay un dibujo por diseño en prueba (src/lib/tema.ts):
// - Carreta: una rueda pintada que gira una ronda a la vez (RuedaCarreta.tsx).
// - Fintech: un anillo con el tiempo de la ronda y un círculo por persona (aquí abajo).
// - Lima: segmentos que se llenan de lima y el punto del logo que señala a quien cobra (RuedaLima.tsx).
// - Cusuco: las placas del caparazón del cusuco enrollado, con la moneda al centro (RuedaCusuco.tsx).
// - Ronda: personas tomadas de la mano alrededor de la bolsa (RuedaRonda.tsx).
// El modelo (quién está dónde, quién pagó, cuánto gira) es común: src/lib/rueda.ts.
import type { CSSProperties, ReactNode } from 'react'
import type { DatosTanda, MiembroConDireccion } from '../hooks/useTanda'
import { monto, duracion } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { armarRueda, type ModeloRueda } from '../lib/rueda'
import { useTema, type Tema } from '../lib/tema'
import { useSimbolo } from '../hooks/useMoneda'
import { RuedaCarreta } from './RuedaCarreta'
import { RuedaLima } from './RuedaLima'
import { RuedaCusuco } from './RuedaCusuco'
import { RuedaRonda } from './RuedaRonda'

type Props = { datos: DatosTanda; ahora: number; yo: string | null }

export function Rueda({ datos, ahora, yo }: Props) {
  const tema = useTema()
  const m = armarRueda(datos, ahora, yo)
  const estado = datos.tanda.estado.tag
  const etiqueta = resumen(datos, m.restante)
  const centro = <Centro datos={datos} beneficiario={m.beneficiario} restante={m.restante} />

  return (
    <figure className="rueda">
      <DibujoRueda tema={tema} m={m} centro={centro} etiqueta={etiqueta} />

      {estado !== 'Abierta' && (
        <figcaption className="leyenda">
          <span>
            <i className={`muestra ${MUESTRA_TURNO[tema]}`} /> {tema === 'fintech' ? 'Le toca cobrar' : 'Cobra esta ronda'}
          </span>
          <span>
            <i className={`muestra ${MUESTRA_PAGO[tema]}`} /> Pagó esta ronda
          </span>
          <span>
            <i className="muestra cobro">
              <Visto />
            </i>{' '}
            Ya cobró
          </span>
        </figcaption>
      )}
    </figure>
  )
}

// La leyenda dibuja lo mismo que la rueda de cada diseño: cómo se marca a quien cobra y lo pagado.
const MUESTRA_TURNO: Record<Tema, string> = { carreta: 'flecha', fintech: 'turno', lima: 'punto-lima', cusuco: 'cabeza', ronda: 'luz' }
const MUESTRA_PAGO: Record<Tema, string> = { carreta: 'pintado', fintech: 'pago', lima: 'pintado', cusuco: 'pintado', ronda: 'ropa' }

/** El dibujo de la rueda según el diseño en prueba (también lo usa la rueda de ejemplo de la portada). */
export function DibujoRueda({ tema, m, centro, etiqueta }: { tema: Tema; m: ModeloRueda; centro: ReactNode; etiqueta: string }) {
  switch (tema) {
    case 'carreta':
      return <RuedaCarreta m={m} centro={centro} etiqueta={etiqueta} />
    case 'lima':
      return <RuedaLima m={m} centro={centro} etiqueta={etiqueta} />
    case 'cusuco':
      return <RuedaCusuco m={m} centro={centro} etiqueta={etiqueta} />
    case 'ronda':
      return <RuedaRonda m={m} centro={centro} etiqueta={etiqueta} />
    default:
      return <RuedaAnillo m={m} centro={centro} etiqueta={etiqueta} />
  }
}

/** La marca de "ya cobró", dibujada (no un carácter). */
function Visto() {
  return (
    <svg viewBox="-6 -6 12 12" aria-hidden="true">
      <path d="M -3.5 0.3 L -1 2.8 L 3.6 -2.4" />
    </svg>
  )
}

const R_ANILLO = 132 // donde van las personas, sobre el anillo del tiempo
const R_NOMBRE_ANILLO = 186
const CIRC_ANILLO = 2 * Math.PI * R_ANILLO

export function RuedaAnillo({ m, centro, etiqueta }: { m: ModeloRueda; centro: ReactNode; etiqueta: string }) {
  return (
    <svg className="rueda-anillo" viewBox="-250 -214 500 428" role="img" aria-label={etiqueta}>
      <circle className="rueda-pista" r={R_ANILLO} />
      {m.activa && (
        <circle
          className={m.vencida ? 'rueda-tiempo vencida' : 'rueda-tiempo'}
          r={R_ANILLO}
          strokeDasharray={CIRC_ANILLO}
          strokeDashoffset={m.vencida ? 0 : CIRC_ANILLO * (1 - m.fraccionRestante)}
          transform="rotate(-90)"
        />
      )}
      {centro}
      {m.asientos.map((a) => {
        const ang = ((-90 + (a.i * 360) / m.n) * Math.PI) / 180
        const x = R_ANILLO * Math.cos(ang)
        const y = R_ANILLO * Math.sin(ang)
        const clases = ['nodo', a.libre && 'libre', a.turno && 'turno', a.pago && 'pago', a.moroso && 'moroso', a.yo && 'yo']
          .filter(Boolean)
          .join(' ')
        return (
          <g key={a.i} className={clases} style={{ '--i': a.i } as CSSProperties}>
            {a.turno && <circle className="nodo-halo" cx={x} cy={y} r={27} />}
            <circle className="nodo-punto" cx={x} cy={y} r={24} />
            <text className="nodo-turno" x={x} y={y + 6}>
              {a.numero}
            </text>
            {a.cobro && (
              <g className="nodo-cobro" transform={`translate(${x + 18} ${y - 18})`}>
                <circle r={10} />
                <path d="M -4.5 0.5 L -1.2 3.8 L 4.8 -3.2" />
              </g>
            )}
            <text className="nodo-nombre" x={R_NOMBRE_ANILLO * Math.cos(ang)} y={R_NOMBRE_ANILLO * Math.sin(ang) + 5}>
              {a.nombre}
            </text>
          </g>
        )
      })}
    </svg>
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

  // Las líneas quedan centradas en el cubo: la primera (la grande) un poco más arriba.
  const y0 = lineas.length === 1 ? 9 : lineas.length === 2 ? -2 : -14
  return (
    <g className="centro">
      {lineas.map((l, i) => (
        <text key={i} className={l.clase} x={0} y={y0 + i * 25 + (i > 0 ? 6 : 0)}>
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
