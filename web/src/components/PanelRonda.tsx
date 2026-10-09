// Panel de acciones: muestra solo los botones que tienen sentido en este momento,
// según el estado de la tanda y quién está conectado en Freighter.
import { useState } from 'react'
import type { Client } from 'tanda'
import type { contract } from '@stellar/stellar-sdk'
import type { DatosTanda } from '../hooks/useTanda'
import type { Billetera } from '../hooks/useBilletera'
import { BotonesEntrar } from './BotonesEntrar'
import { AccionesTurnos } from './AccionesTurnos'
import { PagarDeuda } from './PagarDeuda'
import { CerrarRonda } from './CerrarRonda'
import { puedeCerrarAntes } from '../lib/cobro'
import { NotaHistorial } from './NotaHistorial'
import { useGarantiaConHistorial } from '../hooks/useHistorial'
import { clienteFirma, enviar, traducirError } from '../lib/contrato'
import { duracion, porcentaje } from '../lib/formato'
import { dinero } from '../lib/glosario'
import { nombreConocido, nombreDe } from '../lib/nombres'
import { cadaCuanto, lineaTanda } from '../lib/resumen'
import { SIN_TURNO, eligeTurno, type Modo } from '../lib/turnos'
import { comoConseguir, useMoneda } from '../hooks/useMoneda'

type Props = {
  id: number
  datos: DatosTanda
  billetera: Billetera
  /** Saldo (en la moneda de la tanda) de quien está conectado (null si todavía no se sabe). */
  saldo: bigint | null
  ahora: number
  alCambiar: () => void
}

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null

export function PanelRonda({ id, datos, billetera, saldo, ahora, alCambiar }: Props) {
  const [aviso, setAviso] = useState<Aviso>(null)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const ocupado = aviso?.tipo === 'esperando'

  const { tanda, miembros, pagaron, vence, colateralSiguiente: colateralNormal } = datos
  const estado = tanda.estado.tag
  const modo: Modo = datos.turnos?.opciones.modo.tag ?? 'Llegada'
  const yo = billetera.direccion
  const esCreador = yo !== null && yo === tanda.creador
  const mio = miembros.find((m) => m.direccion === yo) ?? null
  const yaPague = yo !== null && pagaron.includes(yo)
  // M2: con descuento por historial, la garantía de quien está conectado puede ser menor que la normal.
  const historial = useGarantiaConHistorial(id, yo, colateralNormal)
  const colateralSiguiente = historial.garantia ?? colateralNormal
  const restante = vence - ahora
  const vencida = estado === 'Activa' && restante <= 0
  // M1 v4: si todos pagaron, la ronda se puede cerrar antes (menos en la subasta).
  const antes = puedeCerrarAntes(tanda, pagaron.length, modo, ahora)
  const beneficiario = estado === 'Activa' ? miembros.find((m) => m.posicion === tanda.ronda_actual) : undefined
  const bolsa = tanda.cuota * BigInt(tanda.n_miembros)
  // Quien llega por un enlace a una tanda abierta (y no está en ella) ve primero la invitación.
  const invitado = estado === 'Abierta' && !mio && !esCreador && tanda.n_miembros > miembros.length
  const anfitrion = nombreConocido(tanda.creador)
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
      {invitado ? (
        <div className="invitacion">
          <h2 id="panel-titulo">{anfitrion ? `${anfitrion} te invita a una tanda` : 'Te invitaron a una tanda'}</h2>
          <p className="invitacion-linea">{lineaTanda({ cuota: tanda.cuota, n: tanda.n_miembros, periodoSeg: Number(tanda.periodo_seg) })}</p>
          <p className="explica">
            {`${cadaCuanto(Number(tanda.periodo_seg)).replace(/^c/, 'C')} una persona recibe ${dinero(bolsa)}.`}{' '}
            {colateralSiguiente !== null && !eligeTurno(modo) && (
              <>
                Dejas <strong>{dinero(colateralSiguiente)}</strong> de depósito de seguridad y lo recuperas al final, con
                intereses.
              </>
            )}
          </p>
        </div>
      ) : (
        <h2 id="panel-titulo">{tituloPanel(estado, tanda.ronda_actual, tanda.n_miembros)}</h2>
      )}

      <dl className="datos">
        {estado === 'Abierta' && !invitado && (
          <>
            <Dato etiqueta="Lugares libres" valor={`${tanda.n_miembros - miembros.length} de ${tanda.n_miembros}`} />
            {colateralSiguiente !== null && (
              <Dato
                etiqueta="Depósito para unirse"
                valor={eligeTurno(modo) ? 'Según el turno' : `${dinero(colateralSiguiente)}`}
              />
            )}
          </>
        )}
        {estado === 'Activa' && (
          <>
            <Dato
              etiqueta="Le toca cobrar"
              valor={beneficiario ? nombreDe(beneficiario.direccion) : modo === 'Subasta' ? 'Se decide en la subasta' : '-'}
            />
            <Dato etiqueta="Pozo" valor={dinero(bolsa)} />
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
            {!invitado && <p>Entra para participar en esta tanda.</p>}
            <BotonesEntrar billetera={billetera} textoGoogle={invitado ? 'Entrar con Google y unirme' : 'Entrar con Google'} />
          </>
        ) : !billetera.redCorrecta ? (
          <p className="aviso error">Freighter está en otra red. Cámbiala a Testnet para continuar.</p>
        ) : (
          <>
            {estado === 'Abierta' && !mio && colateralSiguiente !== null && !eligeTurno(modo) && (
              <>
                <button
                  className="boton principal"
                  disabled={ocupado || faltaParaUnirse > 0n}
                  onClick={() => ejecutar((c) => c.unirse({ id, miembro: yo }), 'Listo: ya eres parte de la tanda.')}
                >
                  Unirme y dejar {dinero(colateralSiguiente)} de depósito
                </button>
                {faltaParaUnirse > 0n && <FaltaSaldo falta={faltaParaUnirse} />}
                <NotaHistorial yo={yo} requisitos={historial.requisitos} normal={colateralNormal!} conDescuento={historial.garantia} />
                <p className="explica">
                  {modo === 'Sorteo'
                    ? 'Tu turno se sorteará cuando se llene la tanda.'
                    : modo === 'Subasta'
                      ? 'Tu turno se decide en las subastas de cada turno.'
                      : `Tu turno será el ${miembros.length + 1}: cobras ${dinero(bolsa)} en ese turno.`}
                  {!invitado && ' El depósito de seguridad se te devuelve al final, con intereses.'}
                </p>
              </>
            )}

            {/* M2 + M3: donde se elige turno, la garantía con descuento sale en cada turno (cotizar_turno). */}
            {estado === 'Abierta' && !mio && eligeTurno(modo) && (
              <NotaHistorial yo={yo} requisitos={historial.requisitos} normal={colateralNormal ?? 0n} conDescuento={null} />
            )}

            {estado === 'Activa' && mio && !yaPague && !mio.moroso && (
              <>
                <button
                  className="boton principal"
                  disabled={ocupado || faltaParaPagar > 0n}
                  onClick={() => ejecutar((c) => c.pagar_cuota({ id, miembro: yo }), 'Listo: pagaste tu cuota de este turno.')}
                >
                  Pagar mi cuota de {dinero(tanda.cuota)}
                </button>
                {faltaParaPagar > 0n && <FaltaSaldo falta={faltaParaPagar} />}
                {vencida && (
                  <p className="explica">
                    El plazo ya venció: si pagas ahora cuenta como atraso, y al final se descuenta una multa de{' '}
                    {dinero(multa)} de tu depósito.
                  </p>
                )}
              </>
            )}

            <PagarDeuda id={id} datos={datos} yo={yo} saldo={saldo} alCambiar={alCambiar} />

            {estado === 'Activa' && (vencida || antes) && (
              <CerrarRonda
                miembros={miembros}
                pagaron={pagaron}
                cuota={tanda.cuota}
                beneficiario={beneficiario}
                yo={yo}
                ocupado={ocupado}
                antes={antes}
                siguienteVence={vence + Number(tanda.periodo_seg)}
                ahora={ahora}
                cerrar={(textoListo) => ejecutar((c) => c.cerrar_ronda({ id }), textoListo)}
              />
            )}

            {estado === 'Activa' && !vencida && !antes && pagaron.length === tanda.n_miembros && (
              <p className="explica">
                Todos pagaron.{' '}
                {modo === 'Subasta'
                  ? 'En la subasta el pozo se entrega cuando termina el plazo: hasta entonces se puede ofertar.'
                  : 'Ya se adelantaron varios turnos, así que el pozo se puede entregar cuando falten menos de 4 meses para la próxima fecha límite.'}
              </p>
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
                  Devuelve a cada persona su depósito con los intereses, y reparte las multas entre quienes siempre
                  pagaron a tiempo.
                </p>
              </>
            )}

            {estado === 'Finalizada' && (
              <p className="explica">Esta tanda terminó. Cada persona ya recibió su depósito y su parte de los intereses.</p>
            )}

            {estado === 'Cancelada' && (
              <p className="explica">
                Esta tanda se canceló antes de empezar. Cada persona que se había unido recuperó su depósito, con los
                intereses que alcanzó a ganar.
              </p>
            )}

            {estado === 'Abierta' && esCreador && (
              <div className="cancelar">
                {confirmandoCancelar ? (
                  <>
                    <p className="explica">
                      ¿Cancelar esta tanda?{' '}
                      {miembros.length > 0
                        ? `Se devolverá el depósito, con sus intereses, a ${miembros.length === 1 ? 'la persona que ya se unió' : `las ${miembros.length} personas que ya se unieron`}.`
                        : 'Todavía no se ha unido nadie.'}{' '}
                      No se puede deshacer.
                    </p>
                    <div className="fila-botones">
                      <button
                        className="boton secundario peligro"
                        disabled={ocupado}
                        onClick={() =>
                          ejecutar((c) => c.cancelar({ id }), 'La tanda se canceló y se devolvieron los depósitos.')
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

      <AccionesTurnos id={id} datos={datos} billetera={billetera} saldo={saldo} ahora={ahora} alCambiar={alCambiar} />

      {(aviso || billetera.error) && (
        <p className={`aviso ${aviso?.tipo ?? 'error'}`} role="status" aria-live="polite">
          {aviso?.texto ?? billetera.error}
        </p>
      )}

      <details className="reglas">
        <summary>Reglas de esta tanda</summary>
        <dl className="datos">
          <Dato etiqueta="Cuota por turno" valor={`${dinero(tanda.cuota)}`} />
          <Dato etiqueta="Cada cuánto se paga" valor={duracion(Number(tanda.periodo_seg))} />
          <Dato etiqueta="Multa por atraso" valor={`${porcentaje(tanda.penalidad_bps)} de la cuota`} />
          <Dato etiqueta="Depósito de seguridad" valor={`${porcentaje(tanda.cobertura_bps)} de las cuotas que faltan`} />
        </dl>
        <p className="explica">
          Quien cobra antes deja un depósito más grande, porque después de cobrar todavía debe más cuotas. Si alguien
          desaparece, su depósito paga por él.
        </p>
      </details>
    </section>
  )
}

function FaltaSaldo({ falta }: { falta: bigint }) {
  const moneda = useMoneda()
  return (
    <p className="aviso nota">
      Te faltan {dinero(falta)}. {comoConseguir(moneda)} para recibir más.
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
      return `Turno ${ronda + 1} de ${n}`
    case 'PorLiquidar':
      return 'Todos los turnos terminaron'
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
  if (m.moroso) return `Tienes un pago pendiente de ${dinero(m.deuda)} en esta tanda.`
  const turno = m.posicion === SIN_TURNO
    ? 'Tu turno todavía no está decidido.'
    : m.cobro
    ? 'Ya cobraste tu pozo.'
    : estado === 'Activa' && m.posicion === ronda
      ? 'En este turno cobras tú.'
      : `Cobras en el turno ${m.posicion + 1}.`
  if (estado !== 'Activa') return turno
  return `${turno} ${yaPague ? 'Ya pagaste este turno.' : 'Te falta pagar este turno.'}`
}
