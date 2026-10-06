// La rueda de la carreta de Sarchí: cada persona es un segmento pintado de la rueda.
// - La rueda gira una ronda a la vez: quien cobra queda siempre arriba, bajo la flecha.
// - El segmento se pinta entero cuando esa persona paga la ronda; mientras no paga, queda apenas teñido.
// - La marca de visto es "ya cobró". Los nombres y números giran con la rueda pero siempre quedan derechos.
import type { CSSProperties } from 'react'
import type { ModeloRueda } from '../lib/rueda'

const R_CUBO = 76 // el cubo del centro, donde va la bolsa
const R_TIEMPO = 81 // el aro del tiempo, alrededor del cubo
const R_ADENTRO = 89 // borde interior de los segmentos
const R_AFUERA = 150 // borde exterior de los segmentos
const R_NUMERO = 120 // donde va el número de turno
const R_NOMBRE = 194 // donde van los nombres, afuera de la rueda
const CIRC_TIEMPO = 2 * Math.PI * R_TIEMPO
const COLORES = ['var(--c-rojo)', 'var(--c-amarillo)', 'var(--c-azul)', 'var(--c-verde)']

/** Un segmento apuntando hacia arriba, de ancho 360/n grados menos una ranura. */
function segmento(n: number): string {
  const medio = ((180 / n - 1.4) * Math.PI) / 180
  const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`
  return `M ${p(R_AFUERA, -medio)} A ${R_AFUERA} ${R_AFUERA} 0 0 1 ${p(R_AFUERA, medio)} L ${p(R_ADENTRO, medio)} A ${R_ADENTRO} ${R_ADENTRO} 0 0 0 ${p(R_ADENTRO, -medio)} Z`
}

/** Lleva algo en órbita al ángulo dado, sin girarlo: así los textos quedan derechos mientras la rueda gira. */
function orbita(angulo: number, radio: number): CSSProperties {
  return { transform: `rotate(${angulo}deg) translate(0px, ${-radio}px) rotate(${-angulo}deg)` }
}

export function RuedaCarreta({ m, centro, etiqueta }: { m: ModeloRueda; centro: React.ReactNode; etiqueta: string }) {
  const paso = 360 / m.n
  const forma = segmento(m.n)
  return (
    <svg className={m.activa ? 'rueda-carreta activa' : 'rueda-carreta'} viewBox="-262 -222 524 444" role="img" aria-label={etiqueta}>
      <g className="rc-giro" style={{ transform: `rotate(${m.giro}deg)` }}>
        {m.asientos.map((a) => {
          const clases = ['nodo', !a.miembro && 'libre', a.turno && 'turno', a.pago && 'pago', a.moroso && 'moroso', a.yo && 'yo']
            .filter(Boolean)
            .join(' ')
          return (
            <g key={a.i} transform={`rotate(${a.i * paso})`}>
              <g className={clases} style={{ '--i': a.i, '--color': COLORES[a.color] } as CSSProperties}>
                <path className="rc-segmento" d={forma} />
              </g>
            </g>
          )
        })}
      </g>

      {/* El cubo: la bolsa en juego y el tiempo que le queda a la ronda. */}
      <circle className="rc-cubo" r={R_CUBO} />
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
          <text className={`nodo-nombre${a.yo ? ' yo' : ''}${a.miembro ? '' : ' libre'}`} y={5}>
            {a.nombre}
          </text>
        </g>
      ))}

      {/* La flecha de arriba: quien queda debajo cobra esta ronda. */}
      {m.activa && <path className="rc-flecha" d={`M -13 ${-R_AFUERA - 22} L 13 ${-R_AFUERA - 22} L 0 ${-R_AFUERA + 2} Z`} />}
    </svg>
  )
}
