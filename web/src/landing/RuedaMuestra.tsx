// La rueda de la portada: la misma de la app (carreta o anillo, según el diseño), con una tanda de ejemplo
// de 5 personas que avanza sola. Cada ronda tiene tres momentos: paga quien cobra, pagan casi todos, pagan todos;
// después la rueda gira y cobra la siguiente persona. Con "reducir movimiento" se queda quieta en un momento.
import { useEffect, useState } from 'react'
import { coloresSinRepetir, type ModeloRueda } from '../lib/rueda'
import { useTema } from '../lib/tema'
import { RuedaAnillo } from '../components/Rueda'
import { RuedaCarreta } from '../components/RuedaCarreta'

const NOMBRES = ['Ana', 'Beto', 'Carla', 'Tú', 'Diego']
const N = NOMBRES.length
const MOMENTOS = 3 // por ronda
const PASO_MS = 1300

function modeloMuestra(paso: number): ModeloRueda {
  const vueltas = Math.floor(paso / MOMENTOS) // rondas que ya pasaron (no vuelve atrás: la rueda siempre gira hacia adelante)
  const ronda = vueltas % N
  const momento = paso % MOMENTOS
  const pagaron = [1, 3, N][momento]
  const colores = coloresSinRepetir(N)
  return {
    n: N,
    asientos: NOMBRES.map((nombre, i) => ({
      i,
      miembro: null,
      libre: false,
      nombre,
      numero: String(i + 1),
      pago: (i - ronda + N) % N < pagaron,
      cobro: i < ronda,
      moroso: false,
      yo: nombre === 'Tú',
      turno: i === ronda,
      color: colores[i],
    })),
    activa: true,
    vencida: false,
    restante: 1,
    fraccionRestante: (MOMENTOS - momento) / MOMENTOS,
    giro: -(vueltas * 360) / N,
    beneficiario: null,
  }
}

export function RuedaMuestra() {
  const tema = useTema()
  const [paso, setPaso] = useState(4) // ronda 2, a medio pagar
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setPaso((p) => p + 1), PASO_MS)
    return () => clearInterval(t)
  }, [])

  const m = modeloMuestra(paso)
  const ronda = Math.floor(paso / MOMENTOS) % N
  const etiqueta = `Ejemplo: tanda de ${N} personas, ronda ${ronda + 1}. Cobra ${NOMBRES[ronda]}.`
  const centro = (
    <g className="centro">
      <text className="centro-grande" x={0} y={-6}>
        500
      </text>
      <text className="centro-sub" x={0} y={21}>
        TUSD para {NOMBRES[ronda]}
      </text>
      <text className="centro-nota" x={0} y={44}>
        Ronda {ronda + 1} de {N}
      </text>
    </g>
  )
  return (
    <figure className="rueda ln-rueda">
      {tema === 'carreta' ? (
        <RuedaCarreta m={m} centro={centro} etiqueta={etiqueta} />
      ) : (
        <RuedaAnillo m={m} centro={centro} etiqueta={etiqueta} />
      )}
      <figcaption className="ln-rueda-nota">Una tanda de ejemplo: 5 personas, cuota de 100 TUSD.</figcaption>
    </figure>
  )
}
