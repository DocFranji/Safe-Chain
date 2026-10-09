// Hace aparecer los elementos con [data-revelar] cuando entran en pantalla.
// Usa data-retraso="150" (ms) para escalonar.
import { useEffect, type RefObject } from 'react'

export function useRevelar(raiz: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = raiz.current
    // Con "reducir movimiento" todo queda a la vista desde el principio: nada se esconde para luego aparecer.
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((e) => {
          if (!e.isIntersecting) return
          e.target.classList.remove('oculto')
          io.unobserve(e.target)
        }),
      { threshold: 0.15 },
    )
    el.querySelectorAll<HTMLElement>('[data-revelar]').forEach((n) => {
      if (n.dataset.retraso) n.style.setProperty('--retraso', `${n.dataset.retraso}ms`)
      if (n.getBoundingClientRect().top < window.innerHeight * 0.9) return
      n.classList.add('oculto')
      io.observe(n)
    })
    return () => io.disconnect()
  }, [raiz])
}
