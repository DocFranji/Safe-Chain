// La rueda del diseño "cusuco": la tanda es el cusuco enrollado.
// - Cada persona es una placa del caparazón; la placa se pinta de terracota cuando paga la ronda. Cuando todos
//   pagaron, el caparazón queda completo: la tanda está protegida.
// - La bolsa es la moneda del centro. La rueda gira una ronda a la vez y la cabeza del cusuco, arriba, señala a
//   quien cobra.
import type { CSSProperties, ReactNode } from 'react'
import type { ModeloRueda } from '../lib/rueda'
import { arcoCentrado, orbita, segmentoAnular } from '../lib/geometria'
import { CabezaCusuco } from './Cusuco'

const R_MONEDA = 80
const R_TIEMPO = 88
const R_ADENTRO = 96
const R_AFUERA = 150
const R_NUMERO = 123
const R_NOMBRE = 198
const CIRC_TIEMPO = 2 * Math.PI * R_TIEMPO

export function RuedaCusuco({ m, centro, etiqueta }: { m: ModeloRueda; centro: ReactNode; etiqueta: string }) {
  const paso = 360 / m.n
  const forma = segmentoAnular(m.n, R_ADENTRO, R_AFUERA, 3)
  const bandas = [arcoCentrado(m.n, R_AFUERA - 9, 4), arcoCentrado(m.n, R_ADENTRO + 9, 6)]
  return (
    <svg className={m.activa ? 'rueda-cusuco activa' : 'rueda-cusuco'} viewBox="-262 -246 524 470" role="img" aria-label={etiqueta}>
      <g className="ru-giro" style={{ transform: `rotate(${m.giro}deg)` }}>
        {m.asientos.map((a) => {
          const clases = ['nodo', a.libre && 'libre', a.turno && 'turno', a.pago && 'pago', a.moroso && 'moroso', a.yo && 'yo']
            .filter(Boolean)
            .join(' ')
          return (
            <g key={a.i} transform={`rotate(${a.i * paso})`}>
              <g className={clases} style={{ '--i': a.i } as CSSProperties}>
                <path className="ru-placa" d={forma} />
                {/* Las bandas del caparazón: dos rayas curvas, cerca de los bordes de la placa. */}
                {bandas.map((d) => (
                  <path key={d} className="ru-banda" d={d} />
                ))}
              </g>
            </g>
          )
        })}
      </g>

      {/* La moneda con la bolsa y, alrededor, el tiempo de la ronda. */}
      <circle className="ru-moneda" r={R_MONEDA} />
      <circle className="ru-moneda-canto" r={R_MONEDA - 9} />
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
        <g key={a.i} className={`ru-orbita${a.pago || !m.activa ? ' pintada' : ''}`} style={orbita(a.i * paso + m.giro, R_NUMERO)}>
          <text className="nodo-turno" y={7}>
            {a.numero}
          </text>
          {a.cobro && (
            <g className="nodo-cobro" transform="translate(16 -16)">
              <circle r={10} />
              <path d="M -4.5 0.5 L -1.2 3.8 L 4.8 -3.2" />
            </g>
          )}
        </g>
      ))}
      {m.asientos.map((a) => (
        <g key={a.i} className="ru-orbita" style={orbita(a.i * paso + m.giro, R_NOMBRE)}>
          <text className={`nodo-nombre${a.yo ? ' yo' : ''}${a.libre ? ' libre' : ''}`} y={6}>
            {a.nombre}
          </text>
        </g>
      ))}

      {/* La cabeza del cusuco asoma arriba: quien queda debajo cobra esta ronda. */}
      {m.activa && <CabezaCusuco y={-R_AFUERA - 6} />}
    </svg>
  )
}
