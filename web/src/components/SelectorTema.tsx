// Franja de arriba para comparar los dos diseños en prueba (ver src/lib/tema.ts). Se borra al elegir uno.
import { aplicarTema, TEMAS, useTema } from '../lib/tema'

export function SelectorTema() {
  const tema = useTema()
  return (
    <div className="selector-tema" role="group" aria-label="Diseño en prueba">
      <span className="selector-tema-texto">Diseño en prueba</span>
      <span className="selector-tema-opciones">
        {TEMAS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tema === t.id} onClick={() => aplicarTema(t.id)}>
            {t.nombre}
          </button>
        ))}
      </span>
    </div>
  )
}
