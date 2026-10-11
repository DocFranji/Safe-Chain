// Cuánto ha ganado hasta ahora la garantía depositada en la bóveda.
// Es lo que el contrato calcula igual al final: valor actual de las participaciones - garantía que sigue adentro.
import { useEffect, useState } from 'react'
import type { DatosTanda } from '../hooks/useTanda'
import { aceleradorBoveda, valorBoveda } from '../lib/rpc'
import { dinero, dineroFino } from '../lib/glosario'
import { infoBlend, type InfoBlend } from '../lib/blend'
import { monedaDe } from '../lib/monedas'
import { Info } from './Info'
import { LiquidezBlend } from './LiquidezBlend'
import { BOVEDA_SIMULADA, EXPLORADOR } from '../config'

const INTERVALO_MS = 15_000

export function Rendimiento({ datos }: { datos: DatosTanda }) {
  const { tanda, miembros, boveda } = datos
  const shares = tanda.shares_boveda
  const [valor, setValor] = useState<{ shares: bigint; monto: bigint } | null>(null)
  const [fallo, setFallo] = useState(false)
  const [acelerador, setAcelerador] = useState<number | null>(null)
  // M4: si la bóveda es el adaptador de Blend, el rendimiento es real (y se muestra la liquidez de Blend).
  const [blend, setBlend] = useState<{ boveda: string; info: InfoBlend | null } | null>(null)
  const simbolo = monedaDe(tanda.token).simbolo

  useEffect(() => {
    if (!boveda) return
    let activo = true
    void aceleradorBoveda(boveda).then((a) => {
      if (activo) setAcelerador(a)
    })
    void infoBlend(boveda).then((info) => {
      if (activo) setBlend({ boveda, info })
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
  const enBlend = blend !== null && blend.boveda === boveda ? blend.info : null
  // Solo mostramos el valor si corresponde a las participaciones actuales (si cambiaron, esperamos la nueva lectura).
  const vigente = valor !== null && valor.shares === shares ? valor.monto : null
  const rendimiento = vigente === null ? null : vigente - garantia
  const porcentaje = rendimiento !== null && garantia > 0n ? Number((rendimiento * 10_000n) / garantia) / 100 : null

  return (
    <section className="panel rendimiento" aria-labelledby="rend-titulo">
      <h2 id="rend-titulo">
        Intereses de los depósitos
        <Info etiqueta="Cómo ganan intereses los depósitos">
          Mientras esperan, los depósitos de seguridad ganan intereses. Al final se reparten entre quienes los dejaron, en
          proporción a lo que aportó cada uno.
          {enBlend
            ? ' Estos depósitos están en Blend, un servicio de préstamos: los intereses son reales. En minutos es muy poco, pero es de verdad.'
            : BOVEDA_SIMULADA && textoBoveda(acelerador)}
        </Info>
      </h2>
      {rendimiento !== null ? (
        <dl className="datos">
          <div className="dato">
            <dt>Ganado hasta ahora</dt>
            <dd>
              {rendimiento >= 0n ? '+' : ''}
              {enBlend ? dineroFino(rendimiento) : dinero(rendimiento)}
            </dd>
          </div>
          <div className="dato">
            <dt>Depósitos guardados</dt>
            <dd>
              {dinero(garantia)}
            </dd>
          </div>
          {porcentaje !== null && (
            <div className="dato">
              <dt>Sobre los depósitos</dt>
              <dd>{porcentaje.toLocaleString('es-CR', { maximumFractionDigits: 2 })} %</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="explica">{fallo ? 'No pudimos leer los intereses ahora mismo.' : 'Calculando los intereses…'}</p>
      )}
      {enBlend && (
        <>
          <LiquidezBlend pool={enBlend.pool} token={enBlend.token} simbolo={simbolo} necesario={garantia} />
          <p className="explica">
            <a href={`${EXPLORADOR}/contract/${boveda}`} target="_blank" rel="noreferrer">
              Ver los depósitos en Blend (stellar.expert)
            </a>
          </p>
        </>
      )}
    </section>
  )
}

/** Qué tan "real" es el rendimiento de esta bóveda simulada. */
function textoBoveda(acelerador: number | null): string {
  if (acelerador === null) return ' Como es dinero de práctica, los intereses son simulados.'
  if (acelerador <= 1) return ' Como es dinero de práctica, los intereses son simulados, al ritmo de la vida real (5 % al año).'
  const dias = (acelerador * 60) / 86_400
  return ` Esta es una tanda de prueba: sus intereses simulados corren más rápido para que se noten en minutos (1 minuto equivale a ${dias.toLocaleString('es-CR', { maximumFractionDigits: 1 })} días de intereses).`
}
