// Panel de acciones: muestra solo los botones que tienen sentido en este momento,
// según el estado de la tanda y quién está conectado en Freighter.
import { useState } from 'react'
import type { Client } from 'tanda'
import type { contract } from '@stellar/stellar-sdk'
import type { DatosTanda } from '../hooks/useTanda'
import type { Billetera } from '../hooks/useBilletera'
import { BotonesEntrar } from './BotonesEntrar'
import { PagarDeuda } from './PagarDeuda'
import { clienteFirma, enviar, traducirError } from '../lib/contrato'
import { monto, duracion, porcentaje } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { SIMBOLO } from '../config'

type Props = {
  id: number
  datos: DatosTanda
  billetera: Billetera
  /** Saldo de TUSD de quien está conectado (null si todavía no se sabe). */
  saldo: bigint | null
  ahora: number
  alCambiar: () => void
}

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function PanelRonda({ id, datos, billetera, saldo, ahora, alCambiar }: Props) {
  const [aviso, setAviso] = useState<Aviso>(null)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const ocupado = aviso?.tipo === 'esperando'

  const { tanda, miembros, pagaron, vence, colateralSiguiente } = datos
  const estado = tanda.estado.tag
  const yo = billetera.direccion
  const esCreador = yo !== null && yo === tanda.creador
  const mio = miembros.find((m) => m.direccion === yo) ?? null
  const yaPague = yo !== null && pagaron.includes(yo)
  const restante = vence - ahora
  const vencida = estado === 'Activa' && restante <= 0
  const beneficiario = estado === 'Activa' ? miembros.find((m) => m.posicion === tanda.ronda_actual) : undefined
  const bolsa = tanda.cuota * BigInt(tanda.n_miembros)
  const multa = (tanda.cuota * BigInt(tanda.penalidad_bps)) / 10_000n
  // Si ya sabemos que no alcanza el saldo, no pedimos firmar algo que va a fallar.
  const faltaParaUnirse = saldo !== null && colateralSiguiente !== null && saldo < colateralSiguiente ? colateralSiguiente - saldo : 0n
  const faltaParaPagar = saldo !== null && saldo < tanda.cuota ? tanda.cuota - saldo : 0n

  async function ejecutar(
    construir: (c: Client) => Promise<contract.AssembledTransaction<unknown>>,
    textoListo: string,
  ) {
    if (!yo) return
    setAviso({ tipo: 'esperando', texto: 'Confirma en Freighter y espera unos segundos mientras la red lo registra…' })
    try {
      const tx = await construir(clienteFirma(yo))
      await enviar(tx)
      setAviso({ tipo: 'listo', texto: textoListo })
      alCambiar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: traducirError(e) })
    }
    setConfirmandoCancelar(false)
  }

  return (
    <section className="panel" aria-labelledby="panel-titulo">
      <h2 id="panel-titulo">{tituloPanel(estado, tanda.ronda_actual, tanda.n_miembros)}</h2>

      <dl className="datos">
        {estado === 'Abierta' && (
          <>
            <Dato etiqueta="Lugares libres" valor={`${tanda.n_miembros - miembros.length} de ${tanda.n_miembros}`} />
            {colateralSiguiente !== null && (
              <Dato etiqueta="Garantía para unirse" valor={`${monto(colateralSiguiente)} ${SIMBOLO}`} />
            )}
          </>
        )}
        {estado === 'Activa' && (
          <>
            <Dato etiqueta="Le toca cobrar" valor={beneficiario ? nombreDe(beneficiario.direccion) : '—'} />
            <Dato etiqueta="Bolsa" valor={`${monto(bolsa)} ${SIMBOLO}`} />
            <Dato
              etiqueta={vencida ? 'Venció hace' : 'Vence en'}
              valor={duracion(Math.abs(restante))}
              alerta={vencida}
            />
            <Dato etiqueta="Ya pagaron" valor={`${pagaron.length} de ${tanda.n_miembros}`} />
          </>
        )}
      </dl>

      {mio && <p className="mi-situacion">{miSituacion(estado, mio, yaPague, tanda.ronda_actual)}</p>}

      <div className="acciones">
        {!yo ? (
          <>
            <p>Entra o conecta tu billetera para participar en esta tanda.</p>
            <BotonesEntrar billetera={billetera} />
          </>
        ) : !billetera.redCorrecta ? (
          <p className="aviso error">Freighter está en otra red. Cámbiala a Testnet para continuar.</p>
        ) : (
          <>
            {estado === 'Abierta' && !mio && colateralSiguiente !== null && (
              <>
                <button
                  className="boton principal"
                  disabled={ocupado || faltaParaUnirse > 0n}
                  onClick={() => ejecutar((c) => c.unirse({ id, miembro: yo }), 'Listo: ya eres parte de la tanda.')}
                >
                  Unirme y dejar {monto(colateralSiguiente)} {SIMBOLO} de garantía
                </button>
                {faltaParaUnirse > 0n && <FaltaSaldo falta={faltaParaUnirse} />}
                <p className="explica">
                  Tu turno será el {miembros.length + 1}. La garantía se guarda en una bóveda que genera
                  rendimiento y se te devuelve al final, con intereses.
                </p>
              </>
            )}

            {estado === 'Activa' && mio && !yaPague && !mio.moroso && (
              <>
                <button
                  className="boton principal"
                  disabled={ocupado || faltaParaPagar > 0n}
                  onClick={() => ejecutar((c) => c.pagar_cuota({ id, miembro: yo }), 'Listo: pagaste tu cuota de esta ronda.')}
                >
                  Pagar mi cuota de {monto(tanda.cuota)} {SIMBOLO}
                </button>
                {faltaParaPagar > 0n && <FaltaSaldo falta={faltaParaPagar} />}
                {vencida && (
                  <p className="explica">
                    El plazo ya venció: si pagas ahora cuenta como atraso, y al final se descuenta una multa de{' '}
                    {monto(multa)} {SIMBOLO} de tu garantía.
                  </p>
                )}
              </>
            )}

            <PagarDeuda id={id} datos={datos} yo={yo} saldo={saldo} alCambiar={alCambiar} />

            {estado === 'Activa' && vencida && (
              <>
                <button
                  className="boton secundario"
                  disabled={ocupado}
                  onClick={() =>
                    ejecutar(
                      (c) => c.cerrar_ronda({ id }),
                      `Listo: la ronda se cerró y ${beneficiario ? nombreDe(beneficiario.direccion) : 'el beneficiario'} recibió la bolsa.`,
                    )
                  }
                >
                  Cerrar la ronda y pagarle a {beneficiario ? nombreDe(beneficiario.direccion) : 'quien le toca'}
                </button>
                <p className="explica">
                  Cualquier persona puede cerrar la ronda. A quien no pagó, su garantía le cubre la cuota, así que la
                  bolsa se entrega completa.
                </p>
              </>
            )}

            {estado === 'Activa' && !vencida && pagaron.length === tanda.n_miembros && (
              <p className="explica">Todos pagaron. La bolsa se entrega al cerrar la ronda, cuando termine el plazo.</p>
            )}

            {estado === 'PorLiquidar' && (
              <>
                <button
                  className="boton principal"
                  disabled={ocupado}
                  onClick={() => ejecutar((c) => c.finalizar({ id }), 'Listo: se repartió el dinero final.')}
                >
                  Repartir el dinero final
                </button>
                <p className="explica">
                  Devuelve a cada persona su garantía con el rendimiento, y reparte las multas entre quienes siempre
                  pagaron a tiempo.
                </p>
              </>
            )}

            {estado === 'Finalizada' && (
              <p className="explica">Esta tanda terminó. Cada persona ya recibió su garantía y su parte del rendimiento.</p>
            )}

            {estado === 'Cancelada' && (
              <p className="explica">
                Esta tanda se canceló antes de empezar. Cada persona que se había unido recuperó su garantía, con el
                rendimiento que alcanzó a generar.
              </p>
            )}

            {estado === 'Abierta' && esCreador && (
              <div className="cancelar">
                {confirmandoCancelar ? (
                  <>
                    <p className="explica">
                      ¿Cancelar esta tanda?{' '}
                      {miembros.length > 0
                        ? `Se devolverá la garantía, con su rendimiento, a ${miembros.length === 1 ? 'la persona que ya se unió' : `las ${miembros.length} personas que ya se unieron`}.`
                        : 'Todavía no se ha unido nadie.'}{' '}
                      No se puede deshacer.
                    </p>
                    <div className="fila-botones">
                      <button
                        className="boton secundario peligro"
                        disabled={ocupado}
                        onClick={() =>
                          ejecutar((c) => c.cancelar({ id }), 'La tanda se canceló y se devolvieron las garantías.')
                        }
                      >
                        Sí, cancelar la tanda
                      </button>
                      <button className="boton chico" disabled={ocupado} onClick={() => setConfirmandoCancelar(false)}>
                        No, mantenerla
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="boton chico peligro" disabled={ocupado} onClick={() => setConfirmandoCancelar(true)}>
                    Cancelar esta tanda
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {(aviso || billetera.error) && (
        <p className={`aviso ${aviso?.tipo ?? 'error'}`} role="status" aria-live="polite">
          {aviso?.texto ?? billetera.error}
        </p>
      )}

      <details className="reglas">
        <summary>Reglas de esta tanda</summary>
        <dl className="datos">
          <Dato etiqueta="Cuota por ronda" valor={`${monto(tanda.cuota)} ${SIMBOLO}`} />
          <Dato etiqueta="Duración de cada ronda" valor={duracion(Number(tanda.periodo_seg))} />
          <Dato etiqueta="Multa por atraso" valor={`${porcentaje(tanda.penalidad_bps)} de la cuota`} />
          <Dato etiqueta="Garantía" valor={`${porcentaje(tanda.cobertura_bps)} de las cuotas pendientes`} />
        </dl>
        <p className="explica">
          Quien cobra antes deja más garantía, porque después de cobrar todavía debe más cuotas. Si alguien desaparece,
          su garantía paga por él.
        </p>
      </details>
    </section>
  )
}

function FaltaSaldo({ falta }: { falta: bigint }) {
  return (
    <p className="aviso nota">
      Te faltan {monto(falta)} {SIMBOLO}. Usa el botón "Pedir {SIMBOLO} de prueba" de arriba para recibir más.
    </p>
  )
}

function Dato({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd className={alerta ? 'alerta' : undefined}>{valor}</dd>
    </div>
  )
}

function tituloPanel(estado: string, ronda: number, n: number): string {
  switch (estado) {
    case 'Abierta':
      return 'Buscando participantes'
    case 'Activa':
      return `Ronda ${ronda + 1} de ${n}`
    case 'PorLiquidar':
      return 'Todas las rondas terminaron'
    case 'Finalizada':
      return 'Tanda terminada'
    default:
      return 'Tanda cancelada'
  }
}

function miSituacion(
  estado: string,
  m: { posicion: number; cobro: boolean; moroso: boolean; deuda: bigint },
  yaPague: boolean,
  ronda: number,
): string {
  if (m.moroso) return `Tienes una deuda de ${monto(m.deuda)} ${SIMBOLO} en esta tanda.`
  const turno = m.cobro
    ? 'Ya cobraste tu bolsa.'
    : estado === 'Activa' && m.posicion === ronda
      ? 'Esta ronda cobras tú.'
      : `Cobras en la ronda ${m.posicion + 1}.`
  if (estado !== 'Activa') return turno
  return `${turno} ${yaPague ? 'Ya pagaste esta ronda.' : 'Te falta pagar esta ronda.'}`
}
