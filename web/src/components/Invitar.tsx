// Tarjeta para invitar gente a una tanda abierta: link para copiar y botón de WhatsApp.
import { useRef, useState } from 'react'
import { linkInvitacion } from '../lib/rutas'

type Props = { id: number; libres: number }

export function Invitar({ id, libres }: Props) {
  const [copiado, setCopiado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const link = linkInvitacion(id)
  const mensaje = `Te invito a mi tanda (número ${id}). Entra aquí para unirte: ${link}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sin permiso de portapapeles (por ejemplo, página sin https): dejamos el link seleccionado.
      campo.current?.select()
    }
  }

  return (
    <section className="panel invitar" aria-labelledby="invitar-titulo">
      <h2 id="invitar-titulo">Invita a tu grupo</h2>
      <p className="explica">
        {libres === 1 ? 'Falta 1 persona.' : `Faltan ${libres} personas.`} Cuando entre la última, la tanda arranca sola. Quien
        abra el enlace verá cuánto debe dejar de depósito antes de unirse.
      </p>
      <div className="link-fila">
        <input ref={campo} readOnly value={link} aria-label="Link de invitación" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="boton chico" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <a className="boton chico whatsapp" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
        Enviar por WhatsApp
      </a>
      <p className="sr-solo" role="status" aria-live="polite">
        {copiado ? 'Link copiado' : ''}
      </p>
    </section>
  )
}
