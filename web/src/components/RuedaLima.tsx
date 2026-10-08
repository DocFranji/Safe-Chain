// La rueda del diseño "lima": un segmento por persona alrededor del cubo oscuro donde está la bolsa.
// - El segmento se llena de lima cuando esa persona paga la ronda.
// - La rueda no gira: el punto del logo (aro + punto) da la vuelta por fuera y se detiene en quien cobra.
// - El aro del cubo es el tiempo que le queda a la ronda.
import type { CSSProperties, ReactNode } from 'react'
import type { ModeloRueda } from '../lib/rueda'
import { segmentoAnular } from '../lib/geometria'

const R_CUBO = 82
const R_TIEMPO = 89
const R_ADENTRO = 98
const R_AFUERA = 152
const R_NUMERO = 125
const R_PUNTO = 168 // la órbita del punto que señala a quien cobra
const R_NOMBRE = 214
const CIRC_TIEMPO = 2 * Math.PI * R_TIEMPO

/** Punto en el círculo de radio r, a "grados" desde arriba en sentido del reloj. */
function polar(r: number, grados: number) {
  const a = (grados * Math.PI) / 180
  return { x: r * Math.sin(a), y: -r * Math.cos(a) }
}

export function RuedaLima({ m, centro, etiqueta }: { m: ModeloRueda; centro: ReactNode; etiqueta: string }) {
  const paso = 360 / m.n
  const forma = segmentoAnular(m.n, R_ADENTRO, R_AFUERA, 2.4)
  const quienCobra = m.asientos.find((a) => a.turno)
  return (
    <svg className={m.activa ? 'rueda-lima activa' : 'rueda-lima'} viewBox="-270 -238 540 476" role="img" aria-label={etiqueta}>
      <circle className="rl-pista" r={R_PUNTO} />
      {m.asientos.map((a) => {
        const clases = ['nodo', a.libre && 'libre', a.turno && 'turno', a.pago && 'pago', a.moroso && 'moroso', a.yo && 'yo']
          .filter(Boolean)
          .join(' ')
        const num = polar(R_NUMERO, a.i * paso)
        const nom = polar(R_NOMBRE, a.i * paso)
        return (
          <g key={a.i} className={clases} style={{ '--i': a.i } as CSSProperties}>
            <g transform={`rotate(${a.i * paso})`}>
              <path className="rl-segmento" d={forma} />
            </g>
            <text className="nodo-turno" x={num.x} y={num.y + 7}>
              {a.numero}
            </text>
            {a.cobro && (
              <g className="nodo-cobro" transform={`translate(${num.x + 17} ${num.y - 15})`}>
                <circle r={10} />
                <path d="M -4.5 0.5 L -1.2 3.8 L 4.8 -3.2" />
              </g>
            )}
            <text className={`nodo-nombre${a.yo ? ' yo' : ''}${a.libre ? ' libre' : ''}`} x={nom.x} y={nom.y + 6}>
              {a.nombre}
            </text>
          </g>
        )
      })}

      {/* El cubo: la bolsa y, alrededor, el tiempo de la ronda. */}
      <circle className="rl-cubo" r={R_CUBO} />
      <circle className="rl-tiempo-pista" r={R_TIEMPO} />
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

      {/* El punto del logo: da la vuelta (siempre hacia adelante) y queda junto a quien cobra. */}
      {m.activa && quienCobra && (
        <g className="rl-orbita" style={{ transform: `rotate(${-m.giro}deg)` }}>
          <circle className="rl-punto" cy={-R_PUNTO} r={10} />
        </g>
      )}
    </svg>
  )
}
