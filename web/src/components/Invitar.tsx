// Invitar a una tanda abierta: el botón de WhatsApp con el mensaje ya escrito y el enlace para copiar.
// Para quien ya está en la tanda es la acción principal (va arriba de todo). Si la acaba de crear, saluda
// con "¡Tu tanda está lista!".
import { useRef, useState } from 'react'
import { linkInvitacion } from '../lib/rutas'
import { lineaTanda, mensajeInvitacion } from '../lib/resumen'

type Props = {
  id: number
  tanda: { cuota: bigint; n_miembros: number; periodo_seg: bigint }
  libres: number
  /** Nombre de quien invita (si se conoce), para el saludo del mensaje. */
  quien?: string | null
  /** true: la acaba de crear quien mira (en este navegador). */
  recienCreada?: boolean
  /** true: es la acción principal de la página (para quien ya está en la tanda). */
  principal?: boolean
}

export function Invitar({ id, tanda, libres, quien = null, recienCreada = false, principal = false }: Props) {
  const [copiado, setCopiado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const link = linkInvitacion(id)
  const basicos = { cuota: tanda.cuota, n: tanda.n_miembros, periodoSeg: Number(tanda.periodo_seg) }
  const mensaje = mensajeInvitacion({ ...basicos, link, quien })

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sin permiso de portapapeles (por ejemplo, página sin https): dejamos el enlace seleccionado.
      campo.current?.select()
    }
  }

  return (
    <section className={principal ? 'panel invitar invitar-principal' : 'panel invitar'} aria-labelledby="invitar-titulo">
      <h2 id="invitar-titulo">{recienCreada ? '¡Tu tanda está lista!' : 'Invita a tu grupo'}</h2>
      <p className="invitar-linea">{lineaTanda(basicos)}</p>
      <p className="explica">
        {libres === 1 ? 'Falta 1 persona.' : `Faltan ${libres} personas.`} Mándales el enlace: cuando entre la última,
        la tanda empieza sola. Quien lo abra verá cuánto deja de depósito antes de unirse.
      </p>
      <a
        className={principal ? 'boton principal grande whatsapp' : 'boton chico whatsapp'}
        href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
        target="_blank"
        rel="noreferrer"
      >
        Invitar por WhatsApp
      </a>
      <div className="link-fila">
        <input ref={campo} readOnly value={link} aria-label="Enlace de invitación" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="boton chico" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
      <p className="sr-solo" role="status" aria-live="polite">
        {copiado ? 'Enlace copiado' : ''}
      </p>
    </section>
  )
}
