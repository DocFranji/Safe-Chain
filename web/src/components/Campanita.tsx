// La campanita de la barra (pedido 3 del plan v5): un botón con el número de avisos sin leer y un panel con la lista.
// En la computadora el panel cuelga de la campanita; en el celular es una hoja que sube desde abajo.
// Los avisos salen de lo que se lee de la red (lib/notificaciones.ts, hooks/useNotificaciones.ts): no hay avisos al
// teléfono. Al cerrar el panel lo que se vio queda leído, y eso se guarda en el navegador.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { haceCuanto } from '../lib/notificaciones'
import './campanita.css'

const ENFOCABLES = 'a[href], button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])'
/** Debajo de este ancho el panel es una hoja que tapa la página (igual que en campanita.css). */
const ES_CELULAR = '(max-width: 600px)'

export function Campanita({ yo }: { yo: string }) {
  const { notificaciones, sinLeer, ahora, esNueva, marcarTodas, recargar } = useNotificaciones(yo)
  const [abierta, setAbierta] = useState(false)
  const envoltura = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const idPanel = useId()

  // Al abrir, el foco pasa al panel para que lo lea quien usa teclado o lector de pantalla.
  useEffect(() => {
    if (abierta) panel.current?.focus()
  }, [abierta])

  // Si la persona cambia de página con "atrás" o "adelante" mientras el panel está abierto, se cierra.
  useEffect(() => {
    if (!abierta) return
    const cerrarSolo = () => setAbierta(false)
    window.addEventListener('hashchange', cerrarSolo)
    return () => window.removeEventListener('hashchange', cerrarSolo)
  }, [abierta])

  // En la computadora el panel no tapa la página: un toque fuera lo cierra y sigue su camino (si era sobre "Perfil",
  // va a Perfil). En el celular el velo de atrás recoge el toque (ver `.campana-fondo`). `cerrar` se pide por una
  // referencia para usar siempre lo último que se leyó.
  const cerrarRef = useRef(cerrar)
  useEffect(() => {
    cerrarRef.current = cerrar
  })
  useEffect(() => {
    if (!abierta) return
    const fuera = (e: PointerEvent) => {
      if (e.target instanceof Node && envoltura.current && !envoltura.current.contains(e.target)) cerrarRef.current(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierta])

  function abrir() {
    setAbierta(true)
    recargar()
  }

  /** Cierra el panel y da por leído lo que se vio. */
  function cerrar(devolverFoco = true) {
    marcarTodas()
    setAbierta(false)
    if (devolverFoco) boton.current?.focus()
  }

  function alTeclear(e: KeyboardEvent) {
    if (!abierta) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      cerrar()
      return
    }
    // En el celular el panel tapa la página: el foco no se escapa hacia lo que queda detrás.
    if (e.key === 'Tab' && panel.current && window.matchMedia(ES_CELULAR).matches) {
      const lista = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)]
      if (lista.length === 0) return
      const primero = lista[0]
      const ultimo = lista[lista.length - 1]
      const activo = document.activeElement
      if (e.shiftKey && (activo === primero || activo === panel.current)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
  }

  return (
    <div className="campana" ref={envoltura} onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        className="boton-campana"
        aria-label={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
        aria-haspopup="dialog"
        aria-expanded={abierta}
        aria-controls={abierta ? idPanel : undefined}
        title="Avisos"
        onClick={() => (abierta ? cerrar() : abrir())}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5a6 6 0 0 1 12 0c0 3.3.9 5 1.9 6.2H4.1C5.1 14.5 6 12.8 6 9.5Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
        {sinLeer > 0 && !abierta && (
          <span className="campana-numero" aria-hidden="true">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <>
          <div className="campana-fondo" onClick={() => cerrar()} aria-hidden="true" />
          <div className="campana-panel" id={idPanel} ref={panel} tabIndex={-1} role="dialog" aria-label="Avisos">
            <div className="campana-cabeza">
              <h2>Avisos</h2>
              {sinLeer > 0 && (
                <button type="button" className="boton chico" onClick={() => marcarTodas()}>
                  Marcar todo como leído
                </button>
              )}
            </div>

            {notificaciones.length === 0 ? (
              <p className="explica campana-vacio">
                No tienes avisos por ahora. Aquí verás cuándo te toca pagar o cobrar, cuando alguien te pague una deuda y
                cuando te inviten a una tanda. No te mandamos mensajes al teléfono: los avisos aparecen aquí cuando abres
                Rounda.
              </p>
            ) : (
              <ul className="campana-lista">
                {notificaciones.map((n) => {
                  const nueva = esNueva(n)
                  return (
                    <li key={n.id}>
                      <a className={nueva ? 'campana-item nueva' : 'campana-item'} href={n.href} onClick={() => cerrar(false)}>
                        <span className="campana-punto" aria-hidden="true" />
                        <span className="campana-texto">
                          <span className="campana-titulo">
                            {n.titulo}
                            {nueva && <span className="sr-solo"> (nuevo)</span>}
                          </span>
                          {n.detalle && <span className="sub">{n.detalle}</span>}
                          {!n.accion && <span className="sub campana-hora">{haceCuanto(n.cuando, ahora)}</span>}
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}

            <button type="button" className="boton chico campana-cerrar" onClick={() => cerrar()}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
