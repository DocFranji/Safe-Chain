// Barra bajo el encabezado con el estado de la cuenta conectada.
// Guía a una cuenta nueva paso a paso (preparar la cuenta -> activar los dólares de práctica -> recibirlos) y,
// cuando ya está lista, solo muestra el saldo y el botón para recibir más dólares de práctica.
// (Por dentro: Friendbot, la trustline de TUSD y el faucet. Esas palabras no se muestran.)
import { useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import type { Cuenta } from '../hooks/useCuenta'
import { ErrorAmigable, aceptarTusd, activarConFriendbot, pedirFaucet } from '../lib/cuenta'
import { traducirError } from '../lib/contrato'
import { dinero } from '../lib/glosario'
import { FAUCET_URL } from '../config'
import { CuentaUsdc } from './CuentaUsdc'

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function BarraCuenta({ billetera, cuenta }: { billetera: Billetera; cuenta: Cuenta }) {
  const [aviso, setAviso] = useState<Aviso>(null)
  const direccion = billetera.direccion
  if (!direccion || !billetera.redCorrecta) return null

  const { estado, saldo } = cuenta
  const conGoogle = billetera.tipo === 'google'
  const ocupado = aviso?.tipo === 'esperando'

  async function correr(texto: string, accion: () => Promise<void>, listo: string) {
    setAviso({ tipo: 'esperando', texto })
    try {
      await accion()
      await cuenta.recargar()
      setAviso({ tipo: 'listo', texto: listo })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof ErrorAmigable ? e.message : traducirError(e) })
    }
  }

  if (!estado) {
    return cuenta.error ? (
      <p className="barra-cuenta aviso error" role="alert">
        No pudimos leer el estado de tu cuenta. Revisa tu conexión; lo intentaremos de nuevo solos.
      </p>
    ) : null
  }

  let cuerpo
  if (!estado.existe) {
    cuerpo = (
      <>
        <div>
          <strong>Prepara tu cuenta de práctica</strong>
          <p className="explica">Es gratis y toma unos segundos.</p>
        </div>
        <button
          className="boton principal"
          disabled={ocupado}
          onClick={() => correr('Preparando tu cuenta…', () => activarConFriendbot(direccion), 'Listo: tu cuenta está preparada.')}
        >
          Preparar mi cuenta
        </button>
      </>
    )
  } else if (!estado.trustline) {
    cuerpo = (
      <>
        <div>
          <strong>Un último paso: activa tus dólares de práctica</strong>
          <p className="explica">
            {conGoogle ? 'Se confirma con tu cuenta de Google' : 'Freighter te pedirá confirmar'}; no cuesta nada.
          </p>
        </div>
        <button
          className="boton principal"
          disabled={ocupado}
          onClick={() => correr(conGoogle ? 'Confirmando…' : 'Confirma en Freighter…', () => aceptarTusd(direccion), 'Listo: ya puedes recibir dólares de práctica.')}
        >
          Activar dólares de práctica
        </button>
      </>
    )
  } else {
    cuerpo = (
      <>
        <p>
          Tienes:{' '}
          <strong className="saldo">{saldo === null ? '…' : dinero(saldo)}</strong>{' '}
          <span className="sub">(dólares de práctica)</span>
        </p>
        {FAUCET_URL && (
          <button
            className="boton chico"
            disabled={ocupado}
            onClick={() => correr('Pidiendo dólares de práctica…', () => pedirFaucet(direccion), 'Listo: recibiste dólares de práctica.')}
          >
            Recibir más dólares de práctica
          </button>
        )}
      </>
    )
  }

  return (
    <div className="barra-cuenta" role="region" aria-label="Tu cuenta">
      <div className="barra-cuenta-fila">{cuerpo}</div>
      {estado.existe && <CuentaUsdc direccion={direccion} conGoogle={conGoogle} /> /* M4: USDC de Blend */}
      {aviso && (
        <p className={`aviso ${aviso.tipo}`} role="status" aria-live="polite">
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
