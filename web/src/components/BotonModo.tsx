// Botón de claro u oscuro de la barra (en la portada y en la app). El ícono es un círculo mitad lleno que da media
// vuelta al cambiar: la marca es una ronda. La elección queda guardada en el navegador (lib/apariencia.ts).
import { cambiarModo, useModo } from '../lib/apariencia'

export function BotonModo() {
  const oscuro = useModo() === 'oscuro'
  return (
    <button
      type="button"
      className="boton-modo"
      aria-pressed={oscuro}
      aria-label="Modo oscuro"
      title={oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
      onClick={() => cambiarModo(oscuro ? 'claro' : 'oscuro')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.25" />
        <path d="M12 3.75a8.25 8.25 0 0 1 0 16.5z" />
      </svg>
    </button>
  )
}
