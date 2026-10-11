// La pestaña "Amigos" del Perfil (pedido 6 del plan v5): agregar a alguien con su dirección, ver a tus amigos con su
// reputación, invitarlos a una tanda tuya y quitarlos. Se guardan solo en este teléfono o computadora.
import { useState } from 'react'
import { useAmigos } from '../hooks/useAmigos'
import { direccionCorta } from '../lib/nombres'
import { FormAmigo } from './FormAmigo'
import { InsigniaNivel } from './InsigniaNivel'
import { InvitarAmigo } from './InvitarAmigo'
import './amigos.css'

type Accion = { dir: string; que: 'invitar' | 'quitar' } | null

export function Amigos({ yo }: { yo: string }) {
  const { amigos, agregar, quitar } = useAmigos(yo)
  const [accion, setAccion] = useState<Accion>(null)
  const [agregando, setAgregando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <section className="amigos" aria-labelledby="amigos-titulo">
      <h2 id="amigos-titulo">Tus amigos</h2>
      <p className="explica">
        Guarda a las personas con quienes haces tandas para invitarlas rápido.{' '}
        <strong>Tus amigos se guardan solo en este teléfono o computadora</strong>: si entras desde otro, no los verás ahí.
      </p>

      {agregando ? (
        <FormAmigo
          yo={yo}
          amigos={amigos}
          agregar={agregar}
          autoFoco={false}
          alTerminar={(a) => {
            setAgregando(false)
            if (a) setAviso(`Listo: ${a.apodo} quedó en tus amigos.`)
          }}
        />
      ) : (
        <button type="button" className="boton principal" onClick={() => { setAviso(null); setAgregando(true) }}>
          Agregar un amigo
        </button>
      )}
      {aviso && (
        <p className="aviso listo" role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {amigos.length === 0 ? (
        <p className="explica amigos-vacio">
          Todavía no tienes amigos guardados. También puedes agregarlos desde la lista de quiénes participan en una tanda o
          desde su reputación.
        </p>
      ) : (
        <ul className="lista-amigos">
          {amigos.map((a) => {
            const abierto = accion?.dir === a.dir ? accion.que : null
            return (
              <li key={a.dir} className="amigo">
                <div className="amigo-cabeza">
                  <span className="persona-inicial" aria-hidden="true">
                    {(a.apodo.trim()[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="amigo-datos">
                    <span className="amigo-nombre">
                      {a.apodo}
                      <InsigniaNivel dir={a.dir} />
                    </span>
                    <span className="sub" title={a.dir}>
                      {direccionCorta(a.dir)}
                    </span>
                  </span>
                </div>
                <div className="fila-botones">
                  <button type="button" className="boton chico" aria-expanded={abierto === 'invitar'} onClick={() => setAccion(abierto === 'invitar' ? null : { dir: a.dir, que: 'invitar' })}>
                    Invitar a una tanda
                  </button>
                  <button type="button" className="boton chico peligro" aria-expanded={abierto === 'quitar'} onClick={() => setAccion(abierto === 'quitar' ? null : { dir: a.dir, que: 'quitar' })}>
                    Quitar
                  </button>
                </div>
                {abierto === 'invitar' && <InvitarAmigo yo={yo} apodo={a.apodo} />}
                {abierto === 'quitar' && (
                  <div className="confirmar-quitar" role="group" aria-label={`Quitar a ${a.apodo}`}>
                    <p>¿Quitar a {a.apodo} de tus amigos? Solo se borra de este teléfono o computadora.</p>
                    <div className="fila-botones">
                      <button
                        type="button"
                        className="boton secundario peligro"
                        onClick={() => {
                          quitar(a.dir)
                          setAccion(null)
                          setAviso(`${a.apodo} ya no está en tus amigos.`)
                        }}
                      >
                        Sí, quitar
                      </button>
                      <button type="button" className="boton chico" onClick={() => setAccion(null)}>
                        No
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
