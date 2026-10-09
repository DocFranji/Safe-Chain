// Franja de arriba para comparar los diseños en prueba (ver src/lib/tema.ts). Se borra al elegir uno.
import { aplicarModo, aplicarTema, TEMAS, tieneOscuro, useModo, useTema } from '../lib/tema'

export function SelectorTema() {
  const tema = useTema()
  const modo = useModo()
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
      {tieneOscuro(tema) && (
        <button
          type="button"
          className="selector-tema-modo"
          aria-pressed={modo === 'oscuro'}
          onClick={() => aplicarModo(modo === 'oscuro' ? 'claro' : 'oscuro')}
        >
          Modo oscuro
        </button>
      )}
    </div>
  )
}
