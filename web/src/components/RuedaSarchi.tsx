// La rueda de la opción "sarchi": la rueda pintada de la carreta de Sarchí.
// - Cada persona es un segmento; se pinta entero cuando esa persona paga la ronda (mientras no paga, apenas teñido).
// - Los segmentos pintados llevan un filete dorado, la línea fina que pintan los artesanos de Sarchí.
// - La rueda gira una ronda a la vez: quien cobra queda siempre arriba, bajo la flecha.
// - Los colores de la carreta viven solo aquí (y en el logo): el resto de la interfaz es sobria.
import type { CSSProperties, ReactNode } from 'react'
import type { ModeloRueda } from '../lib/rueda'
import { arcoCentrado, orbita, segmentoAnular } from '../lib/geometria'

const R_CUBO = 76 // el cubo del centro, donde va la bolsa
const R_TIEMPO = 81 // el aro del tiempo, alrededor del cubo
const R_ADENTRO = 89 // borde interior de los segmentos
const R_AFUERA = 150 // borde exterior de los segmentos
const R_NUMERO = 120 // donde va el número de turno
const R_NOMBRE = 196 // donde van los nombres, afuera de la rueda
const CIRC_TIEMPO = 2 * Math.PI * R_TIEMPO
const COLORES = ['var(--c-rojo)', 'var(--c-amarillo)', 'var(--c-azul)', 'var(--c-verde)']

export function RuedaSarchi({ m, centro, etiqueta }: { m: ModeloRueda; centro: ReactNode; etiqueta: string }) {
  const paso = 360 / m.n
  const forma = segmentoAnular(m.n, R_ADENTRO, R_AFUERA, 1.4)
  const filete = arcoCentrado(m.n, R_AFUERA - 9, 5)
  return (
    <svg className={m.activa ? 'rueda-carreta activa' : 'rueda-carreta'} viewBox="-262 -224 524 448" role="img" aria-label={etiqueta}>
      <circle className="rc-llanta" r={R_AFUERA + 9} />
      <g className="rc-giro" style={{ transform: `rotate(${m.giro}deg)` }}>
        {m.asientos.map((a) => {
          const clases = ['nodo', `color-${a.color}`, a.libre && 'libre', a.turno && 'turno', a.pago && 'pago', a.moroso && 'moroso', a.yo && 'yo']
            .filter(Boolean)
            .join(' ')
          return (
            <g key={a.i} transform={`rotate(${a.i * paso})`}>
              <g className={clases} style={{ '--i': a.i, '--color': COLORES[a.color] } as CSSProperties}>
                <path className="rc-segmento" d={forma} />
                <path className="rc-filete" d={filete} />
              </g>
            </g>
          )
        })}
      </g>

      {/* El cubo: la bolsa en juego, con su filete punteado, y el tiempo que le queda a la ronda. */}
      <circle className="rc-cubo" r={R_CUBO} />
      <circle className="rc-cubo-filete" r={R_CUBO - 8} />
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

      {m.asientos.map((a) => (
        <g key={a.i} className="rc-orbita" style={orbita(a.i * paso + m.giro, R_NUMERO)}>
          <circle className="rc-numero-fondo" r={15} />
          <text className="nodo-turno" y={6}>
            {a.numero}
          </text>
          {a.cobro && (
            <g className="nodo-cobro" transform="translate(15 -15)">
              <circle r={10} />
              <path d="M -4.5 0.5 L -1.2 3.8 L 4.8 -3.2" />
            </g>
          )}
        </g>
      ))}
      {m.asientos.map((a) => (
        <g key={a.i} className="rc-orbita" style={orbita(a.i * paso + m.giro, R_NOMBRE)}>
          <text className={`nodo-nombre${a.yo ? ' yo' : ''}${a.libre ? ' libre' : ''}`} y={5}>
            {a.nombre}
          </text>
        </g>
      ))}

      {/* La flecha de arriba: quien queda debajo cobra esta ronda. */}
      {m.activa && <path className="rc-flecha" d={`M -13 ${-R_AFUERA - 22} L 13 ${-R_AFUERA - 22} L 0 ${-R_AFUERA + 2} Z`} />}
    </svg>
  )
}
