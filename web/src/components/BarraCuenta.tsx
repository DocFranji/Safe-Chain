// Barra bajo el encabezado con el estado de la cuenta conectada.
// Una cuenta nueva se prepara de una sola vez (crear la cuenta, activar los dólares de práctica y recibirlos):
// con Google pasa sola, sin que la persona haga nada; con Freighter es un botón y una confirmación.
// Cuando ya está lista, solo muestra el saldo y un botón chico para recibir más dólares de práctica.
// (Por dentro: Friendbot, la trustline de TUSD y el faucet. Esas palabras no se muestran.)
import { useEffect, useRef, useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import type { Cuenta } from '../hooks/useCuenta'
import { ErrorAmigable, pedirFaucet, prepararCuenta, type PasoPreparar } from '../lib/cuenta'
import { traducirError } from '../lib/contrato'
import { dinero } from '../lib/glosario'
import { FAUCET_URL } from '../config'
import { CuentaUsdc } from './CuentaUsdc'

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

const TEXTO_PASO: Record<PasoPreparar, string> = {
  crear: 'Preparando tu cuenta de práctica (1 de 3)…',
  activar: 'Activando tus dólares de práctica (2 de 3)…',
  recibir: 'Recibiendo tus dólares de práctica (3 de 3)…',
}

export function BarraCuenta({ billetera, cuenta }: { billetera: Billetera; cuenta: Cuenta }) {
  const [aviso, setAviso] = useState<Aviso>(null)
  // Con Google, la cuenta se prepara sola una vez por dirección (si falla, queda el botón para reintentar).
  const intentadas = useRef(new Set<string>())
  const direccion = billetera.direccion
  const conGoogle = billetera.tipo === 'google'
  const { estado, saldo } = cuenta
  const lista = estado !== null && estado.existe && estado.trustline
  const ocupado = aviso?.tipo === 'esperando'

  async function preparar() {
    if (!direccion || !estado) return
    try {
      await prepararCuenta(direccion, estado, saldo, (paso) =>
        setAviso({ tipo: 'esperando', texto: paso === 'activar' && !conGoogle ? 'Confirma en Freighter: activamos tus dólares de práctica (2 de 3)…' : TEXTO_PASO[paso] }),
      )
      await cuenta.recargar()
      setAviso({ tipo: 'listo', texto: 'Listo: tu cuenta está preparada y ya tienes dólares de práctica.' })
    } catch (e) {
      await cuenta.recargar()
      setAviso({ tipo: 'error', texto: e instanceof ErrorAmigable ? e.message : traducirError(e) })
    }
  }

  useEffect(() => {
    if (!conGoogle || !direccion || !billetera.redCorrecta || !estado || lista) return
    if (intentadas.current.has(direccion)) return
    intentadas.current.add(direccion)
    void preparar()
    // preparar usa el estado de este momento: se corre una sola vez por dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conGoogle, direccion, billetera.redCorrecta, estado, lista])

  if (!direccion || !billetera.redCorrecta) return null

  if (!estado) {
    return cuenta.error ? (
      <p className="barra-cuenta aviso error" role="alert">
        No pudimos leer el estado de tu cuenta. Revisa tu conexión; lo intentaremos de nuevo solos.
      </p>
    ) : null
  }

  async function recibirMas() {
    if (!direccion) return
    setAviso({ tipo: 'esperando', texto: 'Pidiendo dólares de práctica…' })
    try {
      await pedirFaucet(direccion)
      await cuenta.recargar()
      setAviso({ tipo: 'listo', texto: 'Listo: recibiste dólares de práctica.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof ErrorAmigable ? e.message : traducirError(e) })
    }
  }

  const cuerpo = !lista ? (
    <>
      <div>
        <strong>Prepara tu cuenta de práctica</strong>
        <p className="explica">
          Es gratis: te regalamos dólares de práctica para probar.
          {conGoogle ? ' Se hace solo en unos segundos.' : ' Freighter te pedirá confirmar una vez.'}
        </p>
      </div>
      {!(conGoogle && ocupado) && (
        <button className="boton principal" disabled={ocupado} onClick={() => void preparar()}>
          {aviso?.tipo === 'error' ? 'Intentar de nuevo' : 'Preparar mi cuenta'}
        </button>
      )}
    </>
  ) : (
    <>
      <p>
        Tienes: <strong className="saldo">{saldo === null ? '…' : dinero(saldo)}</strong>{' '}
        <span className="sub">(dólares de práctica)</span>
      </p>
      {FAUCET_URL && (
        <button className={saldo === 0n ? 'boton principal' : 'boton chico'} disabled={ocupado} onClick={() => void recibirMas()}>
          {saldo === 0n ? 'Recibir dólares de práctica' : 'Recibir más dólares de práctica'}
        </button>
      )}
    </>
  )

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
