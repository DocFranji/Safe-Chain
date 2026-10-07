// "Mis deudas" en el Perfil (misión M2, N4): cuánto debe, en qué tanda y un botón para pagar todo.
// Pagar llama `pagar_deuda` de la tanda (misión M1), que también acepta tandas ya terminadas (N2b).
// Mientras haya una deuda abierta no se puede unir a otra tanda (N2a).
import { useEffect, useState } from 'react'
import { clienteFirma, enviar, traducirError } from '../lib/contrato'
import { monto } from '../lib/formato'
import { monedaDe } from '../lib/monedas'
import { leerMisDeudas, type MiDeuda } from '../lib/misDeudas'
import { rutaTanda } from '../lib/rutas'

type Aviso = { id: number; tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function MisDeudas({ yo }: { yo: string }) {
  const [deudas, setDeudas] = useState<MiDeuda[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    leerMisDeudas(yo)
      .then((d) => {
        if (!vivo) return
        setDeudas(d)
        setError(null)
      })
      .catch((e) => vivo && setError(traducirError(e)))
    return () => {
      vivo = false
    }
  }, [yo, vuelta])

  async function pagar(d: MiDeuda) {
    setAviso({ id: d.id, tipo: 'esperando', texto: 'Confirma la firma y espera unos segundos mientras la red lo registra…' })
    try {
      const tx = await clienteFirma(yo).pagar_deuda({ id: d.id, miembro: yo, pagador: yo, monto: d.deuda })
      await enviar(tx)
      setAviso({ id: d.id, tipo: 'listo', texto: `Listo: saldaste tu deuda de la tanda ${d.id}.` })
      setVuelta((v) => v + 1)
    } catch (e) {
      setAviso({ id: d.id, tipo: 'error', texto: traducirError(e) })
    }
  }

  return (
    <section className="perfil-deudas" aria-labelledby="deudas-titulo">
      <h2 id="deudas-titulo">Mis deudas</h2>
      {error ? (
        <p className="aviso error">{error}</p>
      ) : deudas === null ? (
        <p className="cargando" role="status">
          Revisando tus tandas…
        </p>
      ) : deudas.length === 0 ? (
        <p className="explica">No debes nada. Puedes unirte a cualquier tanda.</p>
      ) : (
        <>
          <p className="aviso nota">
            Mientras tengas una deuda no puedes unirte a otra tanda. Al pagarla, el dinero le llega a quien cobró de
            menos por tu falta.
          </p>
          <ul className="lista-deudas">
            {deudas.map((d) => {
              const simbolo = monedaDe(d.tanda.token).simbolo
              const terminada = d.tanda.estado.tag === 'Finalizada'
              return (
                <li key={d.id}>
                  <p>
                    <a href={rutaTanda(d.id)}>Tanda {d.id}</a> {terminada ? '(terminada)' : '(en curso)'}: debes{' '}
                    <strong>
                      {monto(d.deuda)} {simbolo}
                    </strong>
                    {' · '}
                    <a href={rutaTanda(d.id)}>Ver detalle</a> (a quién le llega)
                  </p>
                  <button
                    type="button"
                    className="boton principal"
                    disabled={aviso?.tipo === 'esperando'}
                    onClick={() => void pagar(d)}
                  >
                    Pagar {monto(d.deuda)} {simbolo}
                  </button>
                  {aviso?.id === d.id && (
                    <p className={`aviso ${aviso.tipo}`} role="status" aria-live="polite">
                      {aviso.texto}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
