// USDC de prueba de Blend en la barra de la cuenta (misión M4). Solo aparece si el contrato de la tanda
// acepta tandas en USDC (tiene una bóveda de Blend registrada para él). Con una sola firma, el faucet de
// Blend hace que la cuenta acepte USDC y le entrega 1 000 USDC de prueba (una vez por cuenta).
import { useCallback, useEffect, useState } from 'react'
import { ErrorAmigable } from '../lib/cuenta'
import { traducirError } from '../lib/contrato'
import { monto } from '../lib/formato'
import { USDC, usdcDisponible } from '../lib/monedas'
import { aUnidades, leerUsdc, pedirUsdcBlend, type CuentaUsdc as Estado } from '../lib/usdc'
import { FAUCET_BLEND_URL } from '../config'

const INTERVALO_MS = 10_000

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function CuentaUsdc({ direccion, conGoogle }: { direccion: string; conGoogle: boolean }) {
  const [disponible, setDisponible] = useState(false)
  const [lectura, setLectura] = useState<{ direccion: string; estado: Estado } | null>(null)
  const [aviso, setAviso] = useState<Aviso>(null)

  useEffect(() => {
    let activo = true
    void usdcDisponible().then((s) => {
      if (activo) setDisponible(s)
    })
    return () => {
      activo = false
    }
  }, [])

  const recargar = useCallback(async () => {
    try {
      setLectura({ direccion, estado: await leerUsdc(direccion) })
    } catch {
      // Si Horizon no responde, se reintenta en la próxima vuelta; la barra de TUSD ya avisa de la conexión.
    }
  }, [direccion])

  useEffect(() => {
    if (!disponible) return
    const primera = setTimeout(recargar, 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar()
    }, INTERVALO_MS)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [disponible, recargar])

  const estado = lectura?.direccion === direccion ? lectura.estado : null
  if (!disponible || !USDC || !estado) return null

  async function pedir() {
    setAviso({ tipo: 'esperando', texto: conGoogle ? 'Firmando…' : 'Confirma en Freighter…' })
    try {
      const recibido = await pedirUsdcBlend(direccion)
      await recargar()
      const usdc = recibido.find((r) => r.codigo === 'USDC')
      setAviso({ tipo: 'listo', texto: `Listo: recibiste ${usdc ? monto(aUnidades(usdc.monto)) : 'tus'} USDC de prueba de Blend.` })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof ErrorAmigable ? e.message : traducirError(e) })
    }
  }

  return (
    <div className="cuenta-usdc">
      {estado.trustline ? (
        <p>
          En USDC: <strong className="saldo">{monto(estado.saldo)} USDC</strong>{' '}
          <span className="sub">(de prueba, para tandas con rendimiento real en Blend)</span>
        </p>
      ) : (
        <>
          <p className="explica">
            ¿Quieres probar una tanda con <strong>rendimiento real en Blend</strong>? Recibe 1 000 USDC de prueba con
            una sola firma: tu cuenta acepta USDC y Blend te los envía.
          </p>
          {FAUCET_BLEND_URL && (
            <button className="boton chico" disabled={aviso?.tipo === 'esperando'} onClick={() => void pedir()}>
              Recibir USDC de prueba
            </button>
          )}
        </>
      )}
      {aviso && (
        <p className={`aviso ${aviso.tipo}`} role="status" aria-live="polite">
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
