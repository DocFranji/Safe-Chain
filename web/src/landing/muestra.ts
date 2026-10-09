// La tanda de ejemplo de la portada: 5 personas; cada ronda tiene tres momentos (paga quien cobra, pagan casi
// todos, pagan todos) y después cobra la siguiente persona. La usan la rueda de ejemplo y el celular de Órbita.
import { useEffect, useState } from 'react'

export const NOMBRES = ['Ana', 'Beto', 'Carla', 'Tú', 'Diego']
export const N = NOMBRES.length
export const MOMENTOS = 3 // por ronda
const PASO_MS = 1300

/** El paso de la tanda de ejemplo, que avanza solo (quieto con "reducir movimiento"). */
export function usePasoMuestra(activo = true): number {
  const [paso, setPaso] = useState(4) // ronda 2, a medio pagar
  useEffect(() => {
    if (!activo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setPaso((p) => p + 1), PASO_MS)
    return () => clearInterval(t)
  }, [activo])
  return paso
}

/** Lo que pasa en la tanda de ejemplo en un paso: la ronda, quién cobra y quiénes ya pagaron. */
export function estadoMuestra(paso: number) {
  const ronda = Math.floor(paso / MOMENTOS) % N
  const pagaron = [1, 3, N][paso % MOMENTOS]
  return {
    ronda,
    cobra: NOMBRES[ronda],
    pagaron,
    pago: NOMBRES.map((_, i) => (i - ronda + N) % N < pagaron),
    n: N,
  }
}
