// Piezas de movimiento de la portada Órbita. La marca es una ronda: casi todo gira o dibuja círculos.
// Reglas (docs/diseno.md): solo transform, opacity y el trazo del SVG; los bucles se pausan fuera de pantalla
// (data-activo) y con "reducir movimiento" todo queda quieto y a la vista.
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { sinMovimiento, useEnPantalla, useProgreso } from './movimiento'

/** Un título que entra palabra por palabra, de borroso a nítido. Cada renglón es un bloque. */
export function Palabras({ renglones, retraso = 0 }: { renglones: string[]; retraso?: number }) {
  let i = 0
  return (
    <>
      {renglones.map((r, k) => (
        <span key={k} className="lo-renglon">
          {r.split(' ').map((p, j, todas) => (
            <Fragment key={j}>
              <span className="lo-palabra" style={{ '--i': i++, '--base': `${retraso}ms` } as CSSProperties}>
                {p}
              </span>
              {j < todas.length - 1 ? ' ' : ''}
            </Fragment>
          ))}
        </span>
      ))}
    </>
  )
}

/** Un párrafo que se llena de tinta, palabra por palabra, al bajar. */
export function TextoQueSeLlena({ texto }: { texto: string }) {
  const ref = useProgreso<HTMLParagraphElement>()
  const palabras = texto.split(' ')
  return (
    <p ref={ref} className="lo-llenar" style={{ '--n': palabras.length } as CSSProperties}>
      {palabras.map((p, i) => (
        <Fragment key={i}>
          <span style={{ '--i': i } as CSSProperties}>{p}</span>{' '}
        </Fragment>
      ))}
    </p>
  )
}

/** Un número que cuenta desde cero la primera vez que se ve. */
export function Contador({ valor, sufijo = '', duracion = 1400 }: { valor: number; sufijo?: string; duracion?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(valor)
  useEffect(() => {
    const el = ref.current
    if (!el || sinMovimiento() || valor === 0) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const paso = (t: number) => {
        const x = Math.min(1, (t - t0) / duracion)
        setN(Math.round(valor * (1 - Math.pow(1 - x, 3))))
        if (x < 1) raf = requestAnimationFrame(paso)
      }
      setN(0)
      raf = requestAnimationFrame(paso)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [valor, duracion])
  return (
    <span ref={ref} className="lo-contador">
      <span aria-hidden="true">
        {n}
        {sufijo}
      </span>
      <span className="lo-solo-lector">
        {valor}
        {sufijo}
      </span>
    </span>
  )
}

export type Astro = { a: number; cara?: string; tam?: number }
export type Anillo = { d: number; vel: number; contra?: boolean; astros: Astro[] }

/** Anillos concéntricos que giran despacio, con caras que dan la vuelta sin ponerse de cabeza: la ronda. */
export function Orbitas({ anillos, className = '' }: { anillos: Anillo[]; className?: string }) {
  const [ref] = useEnPantalla<HTMLDivElement>('120px')
  return (
    <div ref={ref} className={`lo-orbitas ${className}`} aria-hidden="true">
      {anillos.map((an, k) => (
        <div
          key={k}
          className={an.contra ? 'lo-anillo contra' : 'lo-anillo'}
          style={{ '--d': `${an.d}px`, '--vel': `${an.vel}s` } as CSSProperties}
        >
          <div className="lo-anillo-giro">
            {an.astros.map((s, j) => (
              <span key={j} className="lo-astro" style={{ '--a': `${s.a}deg`, '--t': `${s.tam ?? 52}px` } as CSSProperties}>
                {s.cara ? <img src={s.cara} alt="" width={56} height={56} decoding="async" /> : <i />}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** El logo de Rounda: un aro con un punto que da la vuelta. */
export function Logo({ tam = 22 }: { tam?: number }) {
  return (
    <span className="lo-logo" style={{ '--t': `${tam}px` } as CSSProperties} aria-hidden="true">
      <span className="lo-logo-punto" />
    </span>
  )
}
