// Ganchos de movimiento de la portada Órbita (ver piezas.tsx).
import { useEffect, useRef, useState, type RefObject } from 'react'

export function sinMovimiento(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Pone data-activo="si|no" según el elemento esté en pantalla, y avisa la primera vez que se ve. */
export function useEnPantalla<T extends HTMLElement>(margen = '0px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [visto, setVisto] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        el.dataset.activo = e.isIntersecting ? 'si' : 'no'
        if (e.isIntersecting) setVisto(true)
      },
      { rootMargin: margen },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [margen])
  return [ref, visto]
}

/** --p de 0 a 1 mientras el elemento cruza la pantalla (para el texto que se llena al bajar). */
export function useProgreso<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (sinMovimiento()) {
      el.style.setProperty('--p', '1')
      return
    }
    let raf = 0
    const medir = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const alto = window.innerHeight
      const p = Math.min(1, Math.max(0, (alto * 0.85 - r.top) / (alto * 0.45 + r.height * 0.6)))
      el.style.setProperty('--p', p.toFixed(3))
    }
    const pedir = () => {
      if (!raf) raf = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)
    return () => {
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      cancelAnimationFrame(raf)
    }
  }, [])
  return ref
}
