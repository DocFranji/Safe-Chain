// Poner, cambiar o quitar el apodo público (misión M2, N4). Queda guardado en el contrato de historial,
// lo ve cualquiera y siempre se muestra con la dirección corta al lado. Cuesta una firma.
import { useState } from 'react'
import { enviar, traducirError } from '../lib/contrato'
import { clienteHistorialFirma, problemaApodo } from '../lib/historial'
import { apodoDe, direccionCorta, fijarApodo } from '../lib/nombres'

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function EditarApodo({ yo, contrato }: { yo: string; contrato: string }) {
  const actual = apodoDe(yo)
  const [texto, setTexto] = useState(actual ?? '')
  const [aviso, setAviso] = useState<Aviso>(null)
  const ocupado = aviso?.tipo === 'esperando'
  const problema = texto === '' ? null : problemaApodo(texto)
  const cambio = texto !== (actual ?? '')

  async function firmar(nuevo: string | null) {
    setAviso({ tipo: 'esperando', texto: 'Confirma la firma y espera unos segundos mientras la red lo guarda…' })
    try {
      const c = clienteHistorialFirma(contrato, yo)
      if (nuevo === null) await enviar(await c.quitar_apodo({ quien: yo }))
      else await enviar(await c.poner_apodo({ quien: yo, apodo: nuevo }))
      fijarApodo(yo, nuevo)
      setTexto(nuevo ?? '')
      setAviso({ tipo: 'listo', texto: nuevo === null ? 'Listo: quitaste tu apodo.' : `Listo: ahora te ven como «${nuevo}».` })
    } catch (e) {
      setAviso({ tipo: 'error', texto: traducirError(e) })
    }
  }

  return (
    <form
      className="perfil-apodo"
      onSubmit={(e) => {
        e.preventDefault()
        if (texto !== '' && !problema && cambio) void firmar(texto)
      }}
    >
      <label htmlFor="apodo">Tu apodo</label>
      <div className="historial-buscar">
        <input
          id="apodo"
          value={texto}
          maxLength={48}
          placeholder="Por ejemplo: Doña Ana"
          aria-invalid={problema !== null}
          aria-describedby="apodo-ayuda"
          onChange={(e) => setTexto(e.target.value)}
          disabled={ocupado}
        />
        <button type="submit" className="boton principal" disabled={ocupado || texto === '' || problema !== null || !cambio}>
          Guardar
        </button>
        {actual && (
          <button type="button" className="boton chico" disabled={ocupado} onClick={() => void firmar(null)}>
            Quitar
          </button>
        )}
      </div>
      <p id="apodo-ayuda" className={problema ? 'aviso error' : 'ayuda'}>
        {problema ??
          `Es público: lo ve cualquiera y queda guardado en Stellar. No pongas tu nombre completo ni datos personales. Siempre se muestra con tu dirección corta (${texto || 'Ana'} · ${direccionCorta(yo)}) para que nadie se haga pasar por ti.`}
      </p>
      {aviso && (
        <p className={`aviso ${aviso.tipo}`} role="status" aria-live="polite">
          {aviso.texto}
        </p>
      )}
    </form>
  )
}
