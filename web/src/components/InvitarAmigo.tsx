// "Invitar a una tanda": elegir una de mis tandas abiertas y compartir el enlace con el nombre del amigo, por
// WhatsApp o copiándolo (pedido 6 del plan v5). Las tandas se leen cuando la persona abre esto, no antes.
import { useEffect, useRef, useState } from 'react'
import { leerMisTandasAbiertas } from '../lib/misTandas'
import type { ResumenTanda } from '../lib/lectura'
import { nombreConocido } from '../lib/nombres'
import { linkInvitacion, RUTA_CREAR } from '../lib/rutas'
import { lineaTanda, mensajeInvitacion } from '../lib/resumen'
import './amigos.css'

type Estado = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'listo'; tandas: ResumenTanda[] }

export function InvitarAmigo({ yo, apodo }: { yo: string; apodo: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [elegida, setElegida] = useState<number | null>(null)
  const [copiado, setCopiado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    leerMisTandasAbiertas(yo)
      .then((tandas) => {
        if (!vivo) return
        setEstado({ tipo: 'listo', tandas })
        if (tandas.length === 1) setElegida(tandas[0].id)
      })
      .catch(() => vivo && setEstado({ tipo: 'error' }))
    return () => {
      vivo = false
    }
  }, [yo])

  if (estado.tipo === 'cargando') {
    return (
      <p className="cargando" role="status">
        Buscando tus tandas abiertas…
      </p>
    )
  }
  if (estado.tipo === 'error') return <p className="aviso error">No pudimos leer tus tandas. Revisa tu conexión e intenta de nuevo.</p>
  if (estado.tandas.length === 0) {
    return (
      <p className="explica">
        No tienes tandas abiertas con lugar libre. <a href={RUTA_CREAR}>Crea una tanda</a> y vuelve para invitar a {apodo}.
      </p>
    )
  }

  const t = estado.tandas.find((x) => x.id === elegida)?.tanda
  const link = t ? linkInvitacion(elegida!) : ''
  const mensaje = t
    ? mensajeInvitacion({ cuota: t.cuota, n: t.n_miembros, periodoSeg: Number(t.periodo_seg), link, quien: nombreConocido(yo), para: apodo })
    : ''

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      campo.current?.select()
    }
  }

  return (
    <div className="invitar-amigo">
      <fieldset className="elegir-tanda">
        <legend>¿A cuál tanda invitas a {apodo}?</legend>
        {estado.tandas.map((r) => (
          <label key={r.id} className={elegida === r.id ? 'opcion-tanda elegida' : 'opcion-tanda'}>
            <input type="radio" name={`tanda-${apodo}`} checked={elegida === r.id} onChange={() => setElegida(r.id)} />
            <span>
              <strong>Tanda {r.id}</strong>
              <span className="sub">
                {lineaTanda({ cuota: r.tanda.cuota, n: r.tanda.n_miembros, periodoSeg: Number(r.tanda.periodo_seg) })} · faltan{' '}
                {r.tanda.n_miembros - r.miembros.length}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {t && (
        <>
          <a className="boton principal whatsapp" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
            Invitar por WhatsApp
          </a>
          <div className="link-fila">
            <input ref={campo} readOnly value={link} aria-label="Enlace de invitación" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="boton chico" onClick={() => void copiar()}>
              {copiado ? 'Copiado' : 'Copiar enlace'}
            </button>
          </div>
          <p className="sr-solo" role="status" aria-live="polite">
            {copiado ? 'Enlace copiado' : ''}
          </p>
        </>
      )}
    </div>
  )
}
