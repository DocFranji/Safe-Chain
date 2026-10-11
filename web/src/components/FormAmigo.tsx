// Formulario para guardar un amigo (pedido 6 del plan v5). Se usa en tres lugares: la lista de quiénes participan
// en una tanda, el perfil público de alguien (la dirección ya se sabe) y la pestaña "Amigos" (se pega la dirección).
// Los amigos se guardan solo en este teléfono o computadora (lib/amigos.ts).
import { useId, useState } from 'react'
import type { Amigo } from '../lib/amigos'
import { limpiarApodo, limpiarDireccion, problemaDeAmigo, APODO_AMIGO_MAX } from '../lib/amigos'
import './amigos.css'

type Props = {
  yo: string
  amigos: Amigo[]
  /** Guarda al amigo; false si el navegador no deja guardar. */
  agregar: (a: Amigo) => boolean
  /** La dirección, si ya se sabe (en la lista de una tanda o en un perfil). Si falta, se pide. */
  dir?: string
  /** Cómo le dice la gente (su apodo público), para no escribirlo de nuevo. */
  sugerido?: string | null
  alTerminar?: (a: Amigo | null) => void
  autoFoco?: boolean
}

export function FormAmigo({ yo, amigos, agregar, dir: dirFija, sugerido, alTerminar, autoFoco = false }: Props) {
  const id = useId()
  const [dirTexto, setDirTexto] = useState('')
  const [apodoTexto, setApodoTexto] = useState(sugerido ?? '')
  const [tocado, setTocado] = useState(false)
  const [noGuardo, setNoGuardo] = useState(false)
  const dir = dirFija ?? limpiarDireccion(dirTexto)
  const apodo = limpiarApodo(apodoTexto)
  const problema = problemaDeAmigo(dir, apodo, yo, amigos)
  // No se regaña a quien todavía no escribió nada: los problemas se muestran después del primer intento.
  const mostrar = tocado ? problema : null

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (problema) return
    const amigo = { dir, apodo }
    if (agregar(amigo)) alTerminar?.(amigo)
    else setNoGuardo(true)
  }

  return (
    <form className="form-amigo" onSubmit={guardar} noValidate>
      {dirFija === undefined && (
        <div className="campo">
          <label htmlFor={`${id}-dir`}>Dirección de tu amigo</label>
          <input
            id={`${id}-dir`}
            value={dirTexto}
            placeholder="G…"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={mostrar?.campo === 'dir' ? true : undefined}
            aria-describedby={`${id}-ayuda`}
            onChange={(e) => setDirTexto(e.target.value)}
          />
        </div>
      )}
      <div className="campo">
        <label htmlFor={`${id}-apodo`}>¿Cómo le dices?</label>
        <input
          id={`${id}-apodo`}
          value={apodoTexto}
          maxLength={APODO_AMIGO_MAX + 10}
          placeholder="Por ejemplo: Beto"
          autoComplete="off"
          autoFocus={autoFoco}
          aria-invalid={mostrar?.campo === 'apodo' ? true : undefined}
          aria-describedby={`${id}-ayuda`}
          onChange={(e) => setApodoTexto(e.target.value)}
        />
      </div>
      <p id={`${id}-ayuda`} className={mostrar ? 'aviso error' : 'ayuda'} role={mostrar ? 'alert' : undefined}>
        {mostrar?.texto ?? 'Se guarda solo en este teléfono o computadora: nadie más lo ve.'}
      </p>
      {noGuardo && (
        <p className="aviso error" role="alert">
          No pudimos guardarlo: tu navegador no deja guardar datos (¿ventana privada?).
        </p>
      )}
      <div className="fila-botones">
        <button type="submit" className="boton principal chico-amigo">
          Guardar amigo
        </button>
        {alTerminar && (
          <button type="button" className="boton chico" onClick={() => alTerminar(null)}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
