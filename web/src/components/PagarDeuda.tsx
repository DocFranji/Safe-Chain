// Pagar una deuda (misión M1). Si quien está conectado quedó en mora, ve cuánto debe, a quién le llega
// el dinero y qué recupera al saldar. Cualquier persona puede pagar también la deuda de otra (un familiar).
// (v4) También con la tanda ya terminada: el pago va directo a quien cobró de menos, o a quienes recibieron
// el reparto final si esa bolsa se retuvo. Saldar deja a la persona al día para unirse a otras tandas.
// Funciona con Freighter y con la cuenta de Google: firma con `clienteFirma`.
import { useState } from 'react'
import type { DatosTanda } from '../hooks/useTanda'
import { clienteFirma, enviar, traducirError } from '../lib/contrato'
import { bolsaQueRecupera, destinoTrasTerminar, errorMontoDeuda, garantiaPendiente } from '../lib/deudas'
import { parseMonto } from '../lib/entradas'
import { monto } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { useSimbolo } from '../hooks/useMoneda'

type Props = {
  id: number
  datos: DatosTanda
  /** Dirección conectada. */
  yo: string
  /** Saldo de TUSD de quien está conectado (null si todavía no se sabe). */
  saldo: bigint | null
  alCambiar: () => void
}

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function PagarDeuda({ id, datos, yo, saldo, alCambiar }: Props) {
  const SIMBOLO = useSimbolo()
  const [aviso, setAviso] = useState<Aviso>(null)
  const [parcial, setParcial] = useState('')
  const { tanda, miembros, deudas } = datos
  const estado = tanda.estado.tag
  if (estado !== 'Activa' && estado !== 'PorLiquidar' && estado !== 'Finalizada') return null
  const terminada = estado === 'Finalizada'

  const mio = miembros.find((m) => m.direccion === yo) ?? null
  const otros = miembros.filter((m) => m.direccion !== yo && m.deuda > 0n)
  if ((!mio || mio.deuda <= 0n) && otros.length === 0) return null

  const ocupado = aviso?.tipo === 'esperando'

  async function pagar(miembro: string, cuanto: bigint, textoListo: string) {
    setAviso({ tipo: 'esperando', texto: 'Confirma la firma y espera unos segundos mientras la red lo registra…' })
    try {
      const tx = await clienteFirma(yo).pagar_deuda({ id, miembro, pagador: yo, monto: cuanto })
      await enviar(tx)
      setAviso({ tipo: 'listo', texto: textoListo })
      setParcial('')
      alCambiar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: traducirError(e) })
    }
  }

  const faltaSaldo = (cuanto: bigint) => (saldo !== null && saldo < cuanto ? cuanto - saldo : 0n)

  return (
    <section className="pagar-deuda" aria-labelledby="deuda-titulo">
      {mio && mio.deuda > 0n && (
        <MiDeuda
          deuda={mio.deuda}
          d={deudas.find((x) => x.direccion === yo)}
          yo={yo}
          multas={mio.multas_pendientes}
          garantia={garantiaPendiente({ ...tanda, estado }, mio.colateral)}
          cobraEnRonda={estado === 'Activa' && !mio.cobro && mio.posicion > tanda.ronda_actual ? mio.posicion + 1 : null}
          terminada={terminada}
          cobro={(dir) => miembros.find((m) => m.direccion === dir)?.cobro ?? true}
          ocupado={ocupado}
          faltaSaldo={faltaSaldo}
          parcial={parcial}
          setParcial={setParcial}
          pagar={(cuanto) =>
            pagar(
              yo,
              cuanto,
              cuanto === mio.deuda
                ? terminada
                  ? 'Listo: saldaste tu deuda. Vuelves a estar al día y puedes unirte a otras tandas.'
                  : 'Listo: saldaste tu deuda. Vuelves a estar al día.'
                : `Listo: pagaste ${monto(cuanto)} ${SIMBOLO} de tu deuda.`,
            )
          }
        />
      )}

      {otros.length > 0 && (
        <details className="deuda-otros">
          <summary>Pagar la deuda de otra persona</summary>
          <p className="explica">
            Cualquiera puede pagar la deuda de otra persona, por ejemplo un familiar. El dinero sale de tu cuenta y le
            llega a quien cobró de menos{terminada ? ' (o, si esa bolsa se repartió al final, a quienes la recibieron)' : ''}.
          </p>
          <ul className="lista-deudas">
            {otros.map((m) => (
              <li key={m.direccion}>
                <span>
                  {nombreDe(m.direccion)} debe{' '}
                  <strong>
                    {monto(m.deuda)} {SIMBOLO}
                  </strong>
                </span>
                <button
                  className="boton chico"
                  disabled={ocupado || faltaSaldo(m.deuda) > 0n}
                  onClick={() =>
                    pagar(m.direccion, m.deuda, `Listo: pagaste la deuda de ${nombreDe(m.direccion)}. Ya está al día.`)
                  }
                >
                  Pagar su deuda
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {aviso && (
        <p className={`aviso ${aviso.tipo}`} role="status" aria-live="polite">
          {aviso.texto}
        </p>
      )}
    </section>
  )
}

type MiDeudaProps = {
  deuda: bigint
  d: Parameters<typeof bolsaQueRecupera>[0]
  yo: string
  multas: bigint
  /** Garantía que se repone de su bolsa si la tanda sigue (para las cuotas que aún debe). */
  garantia: bigint
  /** Ronda (1, 2, ...) en la que cobra si su turno aún no llegó. */
  cobraEnRonda: number | null
  /** (v4) La tanda ya terminó: el pago va directo y no se recupera la bolsa retenida (ya se repartió). */
  terminada: boolean
  /** ¿Esa persona recibió su bolsa? */
  cobro: (direccion: string) => boolean
  ocupado: boolean
  faltaSaldo: (cuanto: bigint) => bigint
  parcial: string
  setParcial: (v: string) => void
  pagar: (cuanto: bigint) => void
}

function MiDeuda({
  deuda,
  d,
  yo,
  multas,
  garantia,
  cobraEnRonda,
  terminada,
  cobro,
  ocupado,
  faltaSaldo,
  parcial,
  setParcial,
  pagar,
}: MiDeudaProps) {
  const SIMBOLO = useSimbolo()
  // Con la tanda terminada, la bolsa retenida ya se repartió: no se recupera.
  const recupera = terminada ? null : bolsaQueRecupera(d, yo, multas, garantia)
  const aQuien = (acreedor: string) =>
    terminada
      ? destinoTrasTerminar(acreedor, yo, cobro) === 'directo'
        ? nombreDe(acreedor)
        : acreedor === yo
          ? 'Tu propia bolsa: se repartió al final, así que va a quienes la recibieron'
          : `La bolsa de ${nombreDe(acreedor)} se repartió al final: va a quienes la recibieron`
      : acreedor === yo
        ? 'Tu propia bolsa, que está retenida'
        : nombreDe(acreedor)
  const montoParcial = parseMonto(parcial)
  const errorParcial = parcial.trim() === '' ? null : errorMontoDeuda(montoParcial, deuda)
  const falta = faltaSaldo(deuda)

  return (
    <>
      <h3 id="deuda-titulo">
        Tienes una deuda de {monto(deuda)} {SIMBOLO}
      </h3>
      <p className="explica">
        {terminada
          ? 'La tanda ya terminó, pero tu deuda sigue pendiente y no puedes unirte a otras tandas hasta pagarla. Si pagas, el dinero va directo a quien cobró de menos por tu atraso:'
          : 'Tu garantía ya no alcanzó a cubrir tus cuotas. Si pagas, el dinero le llega a quien cobró de menos por tu atraso:'}
      </p>
      {d && d.faltantes.length > 0 && (
        <ul className="lista-deudas">
          {d.faltantes.map((f) => (
            <li key={`${f.ronda}-${f.acreedor}`}>
              <span>
                {aQuien(f.acreedor)}
                <span className="sub"> · ronda {f.ronda + 1}</span>
              </span>
              <strong>
                {monto(f.monto)} {SIMBOLO}
              </strong>
            </li>
          ))}
        </ul>
      )}
      <p className="explica">
        {terminada
          ? 'Al saldarla vuelves a estar al día y puedes unirte a otras tandas.'
          : 'Al saldarla vuelves a estar al día y puedes pagar tus cuotas otra vez.'}
        {cobraEnRonda !== null && ` Cobras tu bolsa en la ronda ${cobraEnRonda}, como estaba previsto.`}
        {recupera && ` Recuperas tu bolsa retenida: ${monto(recupera.neto)} ${SIMBOLO}${descuentos(recupera, SIMBOLO)}.`}
      </p>

      <button className="boton principal" disabled={ocupado || falta > 0n} onClick={() => pagar(deuda)}>
        Pagar mi deuda ({monto(deuda)} {SIMBOLO})
      </button>
      {falta > 0n && (
        <p className="aviso nota">
          Te faltan {monto(falta)} {SIMBOLO} para pagarla completa. Puedes pagar una parte.
        </p>
      )}

      <details className="deuda-parcial">
        <summary>Pagar solo una parte</summary>
        <div className="campo">
          <label htmlFor="monto-deuda">Monto</label>
          <div className="con-sufijo">
            <input
              id="monto-deuda"
              inputMode="decimal"
              value={parcial}
              onChange={(e) => setParcial(e.target.value)}
              aria-invalid={errorParcial ? true : undefined}
              aria-describedby="monto-deuda-ayuda"
            />
            <span>{SIMBOLO}</span>
          </div>
          <p id="monto-deuda-ayuda" className={errorParcial ? 'ayuda error' : 'ayuda'}>
            {errorParcial ?? 'Sigues en mora hasta pagar todo, pero lo que pagues ya le llega a quien cobró de menos.'}
          </p>
        </div>
        <button
          className="boton secundario"
          disabled={
            ocupado || montoParcial === null || errorParcial !== null || faltaSaldo(montoParcial) > 0n || parcial.trim() === ''
          }
          onClick={() => montoParcial !== null && pagar(montoParcial)}
        >
          Pagar {montoParcial !== null && errorParcial === null ? `${monto(montoParcial)} ${SIMBOLO}` : 'este monto'}
        </button>
      </details>
    </>
  )
}

/** " (se descuentan 10 TUSD de multas y 100 TUSD quedan como tu garantía...)" o "". */
function descuentos(r: { multas: bigint; garantia: bigint }, SIMBOLO: string): string {
  const partes = [
    r.multas > 0n ? `se descuentan ${monto(r.multas)} ${SIMBOLO} de multas` : null,
    r.garantia > 0n ? `${monto(r.garantia)} ${SIMBOLO} quedan como tu garantía para las cuotas que aún debes` : null,
  ].filter(Boolean)
  return partes.length ? ` (${partes.join(' y ')})` : ''
}
