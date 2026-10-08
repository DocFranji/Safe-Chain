// La rueda del diseño "ronda": la tanda es una ronda de personas tomadas de la mano alrededor de la bolsa.
// - Cada persona lleva su número de turno en la camiseta; la camiseta se pinta de color cuando paga la ronda.
// - La ronda da vueltas una ronda a la vez (las personas siguen derechas) y quien cobra queda arriba, con una
//   luz color mango detrás.
import type { CSSProperties, ReactNode } from 'react'
import type { ModeloRueda } from '../lib/rueda'
import { orbita } from '../lib/geometria'

const R_BOLSA = 78
const R_TIEMPO = 86
const R_RONDA = 140 // por donde pasan las manos tomadas
const R_NOMBRE = 214
const CIRC_TIEMPO = 2 * Math.PI * R_TIEMPO
const ROPA = ['var(--gente-1)', 'var(--gente-2)', 'var(--gente-3)', 'var(--gente-4)']

/** Una persona de frente: cabeza y camiseta, con el número de turno en el pecho. */
function Persona({ numero }: { numero: string }) {
  return (
    <g transform="scale(1.22)">
      <circle className="rr-luz" cy={-4} r={34} />
      <path className="rr-camiseta" d="M -19 -6 C -19 -14 -12 -18 0 -18 C 12 -18 19 -14 19 -6 L 21 24 C 21 27 19 29 16 29 L -16 29 C -19 29 -21 27 -21 24 Z" />
      <circle className="rr-cabeza" cy={-33} r={13} />
      <text className="nodo-turno" y={13}>
        {numero}
      </text>
    </g>
  )
}

export function RuedaRonda({ m, centro, etiqueta }: { m: ModeloRueda; centro: ReactNode; etiqueta: string }) {
  const paso = 360 / m.n
  return (
    <svg className={m.activa ? 'rueda-ronda activa' : 'rueda-ronda'} viewBox="-270 -246 540 492" role="img" aria-label={etiqueta}>
      {/* Los brazos: un círculo que une las manos de todos. */}
      <circle className="rr-brazos" r={R_RONDA} />

      <circle className="rr-bolsa" r={R_BOLSA} />
      {m.activa && (
        <circle
          className={m.vencida ? 'rueda-tiempo vencida' : 'rueda-tiempo'}
          r={R_TIEMPO}
          strokeDasharray={CIRC_TIEMPO}
          strokeDashoffset={m.vencida ? 0 : CIRC_TIEMPO * (1 - m.fraccionRestante)}
          transform="rotate(-90)"
        />
      )}
      {centro}

      {m.asientos.map((a) => {
        const clases = ['nodo', `ropa-${a.color}`, a.libre && 'libre', a.turno && 'turno', a.pago && 'pago', a.moroso && 'moroso', a.yo && 'yo']
          .filter(Boolean)
          .join(' ')
        return (
          <g key={a.i} className="rr-orbita" style={orbita(a.i * paso + m.giro, R_RONDA)}>
            <g className={clases} style={{ '--i': a.i, '--ropa': ROPA[a.color] } as CSSProperties}>
              <Persona numero={a.numero} />
              {a.cobro && (
                <g className="nodo-cobro" transform="translate(30 -30)">
                  <circle r={10} />
                  <path d="M -4.5 0.5 L -1.2 3.8 L 4.8 -3.2" />
                </g>
              )}
            </g>
          </g>
        )
      })}
      {m.asientos.map((a) => (
        <g key={a.i} className="rr-orbita" style={orbita(a.i * paso + m.giro, R_NOMBRE)}>
          <text className={`nodo-nombre${a.yo ? ' yo' : ''}${a.libre ? ' libre' : ''}`} y={8}>
            {a.nombre}
          </text>
        </g>
      ))}
    </svg>
  )
}
