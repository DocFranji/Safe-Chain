// El botón "i" de información: la letra pequeña va aquí y no ocupa la pantalla. Se despliega al pasar el cursor, al
// enfocarlo con el teclado o al tocarlo en el celular (otro toque, Escape o tocar fuera lo cierra). El texto sale en
// un globo que no se corta por las tarjetas ni se sale de la pantalla. Úsalo para explicaciones y aclaraciones;
// lo que la persona debe hacer o un error se queda a la vista.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './info.css'

const ANCHO = 300
const MARGEN = 12
/** Altura aproximada del globo para decidir si cabe debajo (si no cabe y hay más lugar arriba, sale arriba). */
const ALTO_ESTIMADO = 150

type Posicion = { left: number; top?: number; bottom?: number }

export function Info({ children, etiqueta = 'Más información' }: { children: ReactNode; etiqueta?: string }) {
  const [hover, setHover] = useState(false)
  const [foco, setFoco] = useState(false)
  const [fijo, setFijo] = useState(false)
  const [pos, setPos] = useState<Posicion>({ left: MARGEN, top: 0 })
  const boton = useRef<HTMLButtonElement>(null)
  const id = useId()
  const visible = hover || foco || fijo

  /** Coloca el globo junto al botón, sin salirse de la pantalla. */
  function medir() {
    const b = boton.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const ancho = Math.min(ANCHO, window.innerWidth - 2 * MARGEN)
    const left = Math.max(MARGEN, Math.min(r.left + r.width / 2 - ancho / 2, window.innerWidth - ancho - MARGEN))
    const cabeAbajo = r.bottom + 8 + ALTO_ESTIMADO <= window.innerHeight
    setPos(cabeAbajo || r.top < window.innerHeight / 2 ? { left, top: r.bottom + 8 } : { left, bottom: window.innerHeight - r.top + 8 })
  }

  // Mientras se ve: si la página se desplaza o cambia de tamaño, el globo sigue al botón; Escape lo cierra; y un toque
  // fuera quita el que se dejó fijo.
  useEffect(() => {
    if (!visible) return
    const reubicar = () => {
      const b = boton.current
      if (b) {
        const r = b.getBoundingClientRect()
        if (r.bottom < 0 || r.top > window.innerHeight) {
          setHover(false)
          setFijo(false)
          return
        }
      }
      medir()
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setHover(false)
      setFoco(false)
      setFijo(false)
    }
    const fuera = (e: PointerEvent) => {
      if (e.target instanceof Node && !boton.current?.contains(e.target)) {
        setFijo(false)
        setHover(false)
      }
    }
    window.addEventListener('scroll', reubicar, { capture: true, passive: true })
    window.addEventListener('resize', reubicar)
    document.addEventListener('keydown', alTeclear, true)
    document.addEventListener('pointerdown', fuera)
    return () => {
      window.removeEventListener('scroll', reubicar, { capture: true })
      window.removeEventListener('resize', reubicar)
      document.removeEventListener('keydown', alTeclear, true)
      document.removeEventListener('pointerdown', fuera)
    }
  }, [visible])

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="boton-info"
        aria-label={etiqueta}
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        onMouseEnter={() => {
          setHover(true)
          medir()
        }}
        onMouseLeave={() => setHover(false)}
        onFocus={() => {
          setFoco(true)
          medir()
        }}
        onBlur={() => setFoco(false)}
        onClick={(e) => {
          // Dentro de una etiqueta (label) o un resumen (summary), tocar la "i" no debe activar nada más.
          e.preventDefault()
          e.stopPropagation()
          setFijo((f) => !f)
          medir()
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {visible &&
        createPortal(
          <div className="globo-info" id={id} role="tooltip" style={pos}>
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
