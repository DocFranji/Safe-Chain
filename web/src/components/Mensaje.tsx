// Aviso grande y centrado para estados vacíos o de error (antes vivía dentro de App.tsx).
import type { ReactNode } from 'react'

export function Mensaje({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mensaje">
      <h2>{titulo}</h2>
      <p>{children}</p>
    </section>
  )
}
