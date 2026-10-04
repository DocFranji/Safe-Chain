// Barra bajo el encabezado con el estado de la cuenta conectada.
// Guía a una cuenta nueva paso a paso (activar -> aceptar TUSD -> pedir TUSD) y,
// cuando ya está lista, solo muestra el saldo y el botón para pedir más TUSD de prueba.
import { useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import type { Cuenta } from '../hooks/useCuenta'
import { ErrorAmigable, aceptarTusd, activarConFriendbot, pedirFaucet } from '../lib/cuenta'
import { traducirError } from '../lib/contrato'
import { monto } from '../lib/formato'
import { FAUCET_URL, SIMBOLO } from '../config'
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
          <strong>Activa tu cuenta de pruebas</strong>
          <p className="explica">
            Tu billetera todavía no existe en la red de pruebas. Friendbot le regala XLM gratis para pagar las comisiones.
          </p>
        </div>
        <button
          className="boton principal"
          disabled={ocupado}
          onClick={() => correr('Activando tu cuenta…', () => activarConFriendbot(direccion), 'Listo: tu cuenta ya existe.')}
        >
          Activar con Friendbot
        </button>
      </>
    )
  } else if (!estado.trustline) {
    cuerpo = (
      <>
        <div>
          <strong>Acepta {SIMBOLO} para poder usarlo</strong>
          <p className="explica">
            Una cuenta nueva debe aceptar {SIMBOLO} antes de poder recibirlo.{' '}
            {conGoogle ? 'Se firma con tu cuenta de Google' : 'Freighter te pedirá confirmar'}; no cuesta nada.
          </p>
        </div>
        <button
          className="boton principal"
          disabled={ocupado}
          onClick={() => correr(conGoogle ? 'Firmando…' : 'Confirma en Freighter…', () => aceptarTusd(direccion), `Listo: tu cuenta ya acepta ${SIMBOLO}.`)}
        >
          Aceptar {SIMBOLO}
        </button>
      </>
    )
  } else {
    cuerpo = (
      <>
        <p>
          Tu saldo:{' '}
          <strong className="saldo">
            {saldo === null ? '…' : monto(saldo)} {SIMBOLO}
          </strong>{' '}
          <span className="sub">(dinero de prueba)</span>
        </p>
        {FAUCET_URL && (
          <button
            className="boton chico"
            disabled={ocupado}
            onClick={() => correr('Pidiendo TUSD de prueba…', () => pedirFaucet(direccion), `Listo: recibiste ${SIMBOLO} de prueba.`)}
          >
            Pedir {SIMBOLO} de prueba
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
