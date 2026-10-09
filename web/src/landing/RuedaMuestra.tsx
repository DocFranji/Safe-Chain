// La rueda de la portada: la misma de la app (el dibujo de cada diseño), con una tanda de ejemplo
// de 5 personas que avanza sola. Cada ronda tiene tres momentos: paga quien cobra, pagan casi todos, pagan todos;
// después la rueda gira y cobra la siguiente persona. Con "reducir movimiento" se queda quieta en un momento.
import { coloresSinRepetir, type ModeloRueda } from '../lib/rueda'
import { useTema } from '../lib/tema'
import { DibujoRueda } from '../components/Rueda'
import { MOMENTOS, N, NOMBRES, usePasoMuestra } from './muestra'

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

/** Sin `paso`, la rueda avanza sola; con `paso`, la mueve quien la usa (así otra pieza muestra la misma ronda). */
export function RuedaMuestra({ paso: pasoDado, nota = true }: { paso?: number; nota?: boolean }) {
  const tema = useTema()
  const pasoPropio = usePasoMuestra(pasoDado === undefined)
  const paso = pasoDado ?? pasoPropio

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
      <DibujoRueda tema={tema} m={m} centro={centro} etiqueta={etiqueta} />
      {nota && <figcaption className="ln-rueda-nota">Una tanda de ejemplo: 5 personas, cuota de 100 TUSD.</figcaption>}
    </figure>
  )
}
