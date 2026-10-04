// Cuánto ha ganado hasta ahora la garantía depositada en la bóveda.
// Es lo que el contrato calcula igual al final: valor actual de las participaciones - garantía que sigue adentro.
import { useEffect, useState } from 'react'
import type { DatosTanda } from '../hooks/useTanda'
import { aceleradorBoveda, valorBoveda } from '../lib/rpc'
import { monto } from '../lib/formato'
import { BOVEDA_SIMULADA, SIMBOLO } from '../config'

const INTERVALO_MS = 15_000

export function Rendimiento({ datos }: { datos: DatosTanda }) {
  const { tanda, miembros, boveda } = datos
  const shares = tanda.shares_boveda
  const [valor, setValor] = useState<{ shares: bigint; monto: bigint } | null>(null)
  const [fallo, setFallo] = useState(false)
  const [acelerador, setAcelerador] = useState<number | null>(null)

  useEffect(() => {
    if (!boveda) return
    let activo = true
    void aceleradorBoveda(boveda).then((a) => {
      if (activo) setAcelerador(a)
    })
    return () => {
      activo = false
    }
  }, [boveda])

  useEffect(() => {
    if (shares <= 0n) return
    let activo = true
    async function leer() {
      try {
        const v = await valorBoveda(shares, boveda)
        if (activo) {
          setValor({ shares, monto: v })
          setFallo(false)
        }
      } catch {
        if (activo) setFallo(true)
      }
    }
    const primera = setTimeout(leer, 0)
    const t = setInterval(leer, INTERVALO_MS)
    return () => {
      activo = false
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [shares, boveda])

  if (shares <= 0n) return null

  const garantia = miembros.reduce((suma, m) => suma + m.colateral, 0n)
  // Solo mostramos el valor si corresponde a las participaciones actuales (si cambiaron, esperamos la nueva lectura).
  const vigente = valor !== null && valor.shares === shares ? valor.monto : null
  const rendimiento = vigente === null ? null : vigente - garantia
  const porcentaje = rendimiento !== null && garantia > 0n ? Number((rendimiento * 10_000n) / garantia) / 100 : null

  return (
    <section className="panel rendimiento" aria-labelledby="rend-titulo">
      <h2 id="rend-titulo">Rendimiento de la garantía</h2>
      {rendimiento !== null ? (
        <dl className="datos">
          <div className="dato">
            <dt>Ganado hasta ahora</dt>
            <dd>
              {rendimiento >= 0n ? '+' : ''}
              {monto(rendimiento)} {SIMBOLO}
            </dd>
          </div>
          <div className="dato">
            <dt>Garantía en la bóveda</dt>
            <dd>
              {monto(garantia)} {SIMBOLO}
            </dd>
          </div>
          {porcentaje !== null && (
            <div className="dato">
              <dt>Sobre la garantía</dt>
              <dd>{porcentaje.toLocaleString('es-CR', { maximumFractionDigits: 2 })} %</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="explica">{fallo ? 'No pudimos leer la bóveda ahora mismo.' : 'Leyendo la bóveda…'}</p>
      )}
      <p className="explica">
        Mientras espera, la garantía genera intereses. Al final se reparte entre quienes la dejaron, en proporción a lo que
        aportó cada uno.
        {BOVEDA_SIMULADA && textoBoveda(acelerador)}
      </p>
    </section>
  )
}

/** Qué tan "real" es el rendimiento de esta bóveda simulada. */
function textoBoveda(acelerador: number | null): string {
  if (acelerador === null) return ' En esta versión de pruebas la bóveda es simulada.'
  if (acelerador <= 1) return ' En esta versión de pruebas la bóveda es simulada, pero rinde al ritmo de la vida real (interés anual).'
  const dias = (acelerador * 60) / 86_400
  return ` Esta es una tanda de prueba: su bóveda simulada corre más rápido para que el rendimiento se note en minutos (1 minuto equivale a ${dias.toLocaleString('es-CR', { maximumFractionDigits: 1 })} días de intereses).`
}
