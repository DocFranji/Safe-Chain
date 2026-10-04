// En qué moneda es la tanda (misión M4, docs/blend.md §6). Solo aparece si el contrato acepta USDC
// (tiene una bóveda de Blend registrada para él); si no, todas las tandas son en TUSD, como siempre.
// Tarjetas con el mismo aspecto que las opciones de turnos de M3 (clases propias para no mezclarse).
import { useEffect, useState } from 'react'
import { TUSD, monedasDisponibles, type Moneda } from '../lib/monedas'

const LEMA: Record<string, string> = {
  simulado: 'Rendimiento simulado y rápido: ideal para probar',
  real: 'Rendimiento real en Blend, el protocolo de préstamos de Stellar',
}

export function OpcionesMoneda({ valor, alCambiar }: { valor: Moneda; alCambiar: (m: Moneda) => void }) {
  const [monedas, setMonedas] = useState<Moneda[]>([TUSD])

  useEffect(() => {
    let activo = true
    void monedasDisponibles().then((m) => {
      if (activo) setMonedas(m)
    })
    return () => {
      activo = false
    }
  }, [])

  if (monedas.length < 2) return null
  return (
    <fieldset className="campo opciones-moneda">
      <legend>¿En qué moneda?</legend>
      <div className="monedas" role="radiogroup" aria-label="Moneda de la tanda">
        {monedas.map((m) => (
          <label key={m.token} className={m.token === valor.token ? 'moneda elegida' : 'moneda'}>
            <input type="radio" name="moneda" value={m.simbolo} checked={m.token === valor.token} onChange={() => alCambiar(m)} />
            <span className="moneda-titulo">{m.simbolo}</span>
            <span className="moneda-lema">{LEMA[m.real ? 'real' : 'simulado']}</span>
          </label>
        ))}
      </div>
      <p className="ayuda">
        {valor.real
          ? 'La garantía se deposita en Blend y gana intereses de verdad (en minutos es muy poco). Pide tus USDC de prueba en la barra de arriba.'
          : 'La garantía rinde en una bóveda simulada que corre más rápido, para que el rendimiento se note en una demo.'}
      </p>
    </fieldset>
  )
}
