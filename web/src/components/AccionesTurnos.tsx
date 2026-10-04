// Panel de la tanda (misión M3): todo lo de los mecanismos de turnos. Elegir turno al unirse
// (elección y precio por turno), ofertar en la subasta e intercambiar turnos. Solo aparece en
// tandas creadas con opciones de turnos. La lógica vive en lib/turnos.ts.
import { useEffect, useState } from 'react'
import type { Client } from 'tanda'
import type { contract } from '@stellar/stellar-sdk'
import type { DatosTanda, MiembroConDireccion } from '../hooks/useTanda'
import type { Billetera } from '../hooks/useBilletera'
import { clienteFirma, clienteLectura, enviar, leer, traducirError } from '../lib/contrato'
import { colateralDeTurno, type ParametrosTanda } from '../lib/colateral'
import { duracion, monto, porcentaje } from '../lib/formato'
import { parseMonto } from '../lib/entradas'
import { nombreDe } from '../lib/nombres'
import {
  MODOS,
  bpsDesdeTexto,
  descuentoDe,
  eligeTurno,
  intercambiable,
  primaDeTurno,
  siguienteDelRespaldo,
  tieneTurno,
  turnosLibres,
} from '../lib/turnos'
import { EXPLORADOR, SIMBOLO, TANDA_ID } from '../config'

type Props = {
  id: number
  datos: DatosTanda
  billetera: Billetera
  saldo: bigint | null
  ahora: number
  alCambiar: () => void
}

type Aviso = { tipo: 'esperando' | 'listo' | 'error'; texto: string } | null
type Ejecutar = (construir: (c: Client) => Promise<contract.AssembledTransaction<unknown>>, textoListo: string) => Promise<void>

export function AccionesTurnos({ id, datos, billetera, saldo, ahora, alCambiar }: Props) {
  const [aviso, setAviso] = useState<Aviso>(null)
  const { tanda, miembros, turnos } = datos
  if (!turnos) return null

  const modo = turnos.opciones.modo.tag
  const info = MODOS.find((m) => m.modo === modo)
  const estado = tanda.estado.tag
  const yo = billetera.direccion
  const mio = miembros.find((m) => m.direccion === yo) ?? null
  const puedeFirmar = yo !== null && billetera.redCorrecta
  const ocupado = aviso?.tipo === 'esperando'

  // Sin opciones (tanda de siempre) no hay nada que mostrar aquí.
  if (modo === 'Llegada' && !turnos.opciones.permitir_intercambio) return null

  const ejecutar: Ejecutar = async (construir, textoListo) => {
    if (!yo) return
    setAviso({ tipo: 'esperando', texto: 'Confirma la firma y espera unos segundos mientras la red lo registra…' })
    try {
      const tx = await construir(clienteFirma(yo))
      await enviar(tx)
      setAviso({ tipo: 'listo', texto: textoListo })
      alCambiar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: traducirError(e) })
    }
  }

  const comun = { id, datos, yo, mio, puedeFirmar, ocupado, ejecutar }

  return (
    <section className="turnos-acciones" aria-labelledby="turnos-titulo">
      <h3 id="turnos-titulo">Turnos: {info?.titulo.toLowerCase() ?? modo}</h3>
      {info && <p className="explica">{info.lema}.</p>}

      {estado === 'Abierta' && eligeTurno(modo) && !mio && <ElegirTurno {...comun} saldo={saldo} />}
      {estado === 'Abierta' && modo === 'Sorteo' && (
        <p className="explica">
          El orden se sortea cuando se llene la tanda. Todos dejan una cuota de garantía; a quien cobra se le aparta de su
          bolsa el resto de su garantía, que recupera al final con rendimiento.
        </p>
      )}
      {estado === 'Abierta' && modo === 'Subasta' && (
        <p className="explica">
          Cuando se llene, en cada ronda quien necesite el dinero podrá ofrecer recibir un porcentaje menos (hasta{' '}
          {porcentaje(turnos.opciones.descuento_max_bps)}). Todos dejan una cuota de garantía al unirse.
        </p>
      )}
      {estado !== 'Abierta' && modo === 'Sorteo' && (
        <p className="explica">
          El contrato sorteó el orden al llenarse la tanda.{' '}
          <a href={`${EXPLORADOR}/contract/${TANDA_ID}`} target="_blank" rel="noreferrer">
            Ver el contrato en stellar.expert
          </a>
          . El sorteo usa la semilla de la red: ningún participante puede elegirlo.
        </p>
      )}
      {estado === 'Activa' && modo === 'Subasta' && <Subasta {...comun} ahora={ahora} />}
      {estado === 'Activa' && turnos.opciones.permitir_intercambio && <Intercambios {...comun} />}

      {aviso && (
        <p className={`aviso ${aviso.tipo}`} role="status" aria-live="polite">
          {aviso.texto}
        </p>
      )}
    </section>
  )
}

type Comun = {
  id: number
  datos: DatosTanda
  yo: string | null
  mio: MiembroConDireccion | null
  puedeFirmar: boolean
  ocupado: boolean
  ejecutar: Ejecutar
}

function parametros(datos: DatosTanda): ParametrosTanda {
  const t = datos.tanda
  return {
    cuota: t.cuota,
    nMiembros: t.n_miembros,
    periodoSeg: Number(t.periodo_seg),
    penalidadBps: t.penalidad_bps,
    coberturaBps: t.cobertura_bps,
  }
}

// ---------------------------------------------------------------------------
// Elegir turno (elección y precio por turno)
// ---------------------------------------------------------------------------

function ElegirTurno({ id, datos, yo, puedeFirmar, ocupado, ejecutar, saldo }: Comun & { saldo: bigint | null }) {
  const { tanda, miembros, turnos } = datos
  const [elegido, setElegido] = useState<number | null>(null)
  const [cotizado, setCotizado] = useState<{ turno: number; colateral: bigint; prima: bigint } | null>(null)
  const p = parametros(datos)
  const primaBps = turnos?.opciones.prima_max_bps ?? 0
  const libres = turnosLibres(tanda.n_miembros, miembros.map((m) => m.posicion))

  // Con billetera, el contrato dice la garantía exacta (con el descuento por historial, si aplica).
  useEffect(() => {
    if (elegido === null || !yo) return
    let vigente = true
    clienteLectura()
      .cotizar_turno({ id, miembro: yo, posicion: elegido })
      .then(leer)
      .then(([colateral, prima]) => {
        if (vigente) setCotizado({ turno: elegido, colateral, prima })
      })
      .catch(() => undefined) // si falla, queda el cálculo local
    return () => {
      vigente = false
    }
  }, [id, yo, elegido])

  const local = (i: number) => ({ colateral: colateralDeTurno(p, i), prima: primaBps > 0 ? primaDeTurno(p, primaBps, i) : 0n })
  const precio = elegido === null ? null : cotizado?.turno === elegido ? cotizado : { turno: elegido, ...local(elegido) }
  const bolsa = tanda.cuota * BigInt(tanda.n_miembros)
  const falta = precio && saldo !== null && saldo < precio.colateral ? precio.colateral - saldo : 0n

  return (
    <>
      <p className="explica">Elige tu turno antes de unirte. Cobras en la ronda de tu turno.</p>
      <div className="rejilla-turnos" role="group" aria-label="Turnos">
        {Array.from({ length: tanda.n_miembros }, (_, i) => {
          const duenio = miembros.find((m) => m.posicion === i)
          const { colateral, prima } = local(i)
          return (
            <button
              key={i}
              type="button"
              className={elegido === i ? 'turno-casilla elegido' : 'turno-casilla'}
              disabled={!libres.includes(i) || ocupado}
              aria-pressed={elegido === i}
              onClick={() => setElegido(i)}
            >
              <strong>Turno {i + 1}</strong>
              {duenio ? (
                <span className="sub">{nombreDe(duenio.direccion)}</span>
              ) : (
                <>
                  <span className="sub">
                    Garantía {monto(colateral)} {SIMBOLO}
                  </span>
                  {prima !== 0n && (
                    <span className="sub">
                      {prima > 0n ? `Paga ${monto(prima)}` : `Gana ${monto(-prima)}`}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
      {precio && (
        <>
          <p className="explica">
            Turno {precio.turno + 1}: dejas {monto(precio.colateral)} {SIMBOLO} de garantía y en la ronda {precio.turno + 1}{' '}
            recibes {monto(bolsa - precio.prima)} {SIMBOLO}
            {precio.prima > 0n
              ? ` (la bolsa menos ${monto(precio.prima)} por cobrar antes)`
              : precio.prima < 0n
                ? ` (la bolsa más ${monto(-precio.prima)} por esperar)`
                : ''}
            , si todos pagan.
          </p>
          {puedeFirmar && yo && (
            <button
              className="boton principal"
              disabled={ocupado || falta > 0n}
              onClick={() =>
                ejecutar(
                  (c) => c.unirse_en_turno({ id, miembro: yo, posicion: precio.turno }),
                  `Listo: ya eres parte de la tanda, en el turno ${precio.turno + 1}.`,
                )
              }
            >
              Unirme en el turno {precio.turno + 1} y dejar {monto(precio.colateral)} {SIMBOLO}
            </button>
          )}
          {falta > 0n && (
            <p className="aviso nota">
              Te faltan {monto(falta)} {SIMBOLO}. Usa el botón "Pedir {SIMBOLO} de prueba" de arriba para recibir más.
            </p>
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Subasta
// ---------------------------------------------------------------------------

function Subasta({ id, datos, yo, mio, puedeFirmar, ocupado, ejecutar, ahora }: Comun & { ahora: number }) {
  const { tanda, miembros, turnos, vence } = datos
  const [texto, setTexto] = useState('')
  if (!turnos) return null
  const n = tanda.n_miembros
  const ronda = tanda.ronda_actual
  const bolsa = tanda.cuota * BigInt(n)
  const ultima = ronda + 1 >= n
  const restante = vence - ahora
  const abierta = !ultima && restante > 0
  const mejor = turnos.mejor_postor ? { quien: turnos.mejor_postor, bps: turnos.mejor_oferta_bps } : null
  const respaldo = siguienteDelRespaldo(turnos.respaldo, miembros)
  const maximo = turnos.opciones.descuento_max_bps

  if (ultima) {
    const falta = miembros.find((m) => !tieneTurno(m.posicion))
    return (
      <p className="explica">
        Última ronda: no hay subasta. Cobra {falta ? nombreDe(falta.direccion) : 'quien falta'}, la bolsa completa.
      </p>
    )
  }

  const puedeOfertar = mio !== null && !tieneTurno(mio.posicion) && !mio.moroso
  const bps = bpsDesdeTexto(texto)
  const minimo = (mejor?.bps ?? 0) + 1
  const valida = bps !== null && bps >= minimo && bps <= maximo
  const descuento = bps !== null ? descuentoDe(bolsa, bps) : 0n
  const apartado = mio ? colateralDeTurno(parametros(datos), ronda) - mio.colateral : 0n
  const recibe = bolsa - descuento
  const demas = miembros.filter((m) => m.direccion !== yo && !m.moroso).length

  return (
    <>
      <dl className="datos">
        <div className="dato">
          <dt>Mejor oferta</dt>
          <dd>
            {mejor ? `${nombreDe(mejor.quien)}: ${porcentaje(mejor.bps)} menos (${monto(descuentoDe(bolsa, mejor.bps))} ${SIMBOLO})` : 'Nadie todavía'}
          </dd>
        </div>
        <div className="dato">
          <dt>{abierta ? 'Las ofertas cierran en' : 'Ofertas'}</dt>
          <dd className={abierta ? undefined : 'alerta'}>{abierta ? duracion(restante) : 'Cerradas'}</dd>
        </div>
      </dl>
      <p className="explica">
        {mejor
          ? `Si nadie ofrece más, ${nombreDe(mejor.quien)} cobra esta ronda.`
          : respaldo
            ? `Si nadie oferta, cobra ${nombreDe(respaldo)} (orden sorteado al empezar).`
            : 'Si nadie oferta, cobra el siguiente del orden sorteado al empezar.'}{' '}
        El descuento de quien gane se reparte entre los demás y se suma a su garantía.
      </p>

      {puedeOfertar && abierta && puedeFirmar && yo && (
        <>
          <div className="campo fila-oferta">
            <div className="campo">
              <label htmlFor="oferta">Ofrezco recibir menos (%)</label>
              <input
                id="oferta"
                inputMode="decimal"
                placeholder={`De ${porcentaje(minimo)} a ${porcentaje(maximo)}`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                aria-invalid={texto !== '' && !valida ? true : undefined}
                aria-describedby="oferta-ayuda"
              />
            </div>
            <button
              className="boton principal"
              disabled={!valida || ocupado}
              onClick={() =>
                bps !== null &&
                ejecutar((c) => c.ofertar({ id, miembro: yo, descuento_bps: bps }), `Listo: ofreciste recibir ${porcentaje(bps)} menos.`)
              }
            >
              Ofertar
            </button>
          </div>
          <p id="oferta-ayuda" className={texto !== '' && !valida ? 'ayuda error' : 'ayuda'}>
            {texto !== '' && !valida
              ? `Escribe un porcentaje mayor que ${porcentaje(mejor?.bps ?? 0)} y de máximo ${porcentaje(maximo)}.`
              : valida
                ? `Si ganas recibes ${monto(recibe)} ${SIMBOLO}${apartado > 0n ? `; de ahí se apartan hasta ${monto(apartado)} para tu garantía` : ''}. Cada uno de los otros ${demas} recibe unos ${monto(demas > 0 ? descuento / BigInt(demas) : 0n)} ${SIMBOLO} en su garantía.`
                : 'Gana la oferta más alta. Una oferta igual a la mejor no cuenta.'}
          </p>
        </>
      )}
      {mio && tieneTurno(mio.posicion) && (
        <p className="explica">Ya tienes turno (ronda {mio.posicion + 1}): no puedes ofertar.</p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Intercambio
// ---------------------------------------------------------------------------

type Sentido = 'nada' | 'pago' | 'cobro'

function Intercambios({ id, datos, yo, mio, puedeFirmar, ocupado, ejecutar }: Comun) {
  const { tanda, miembros, turnos } = datos
  const [con, setCon] = useState('')
  const [sentido, setSentido] = useState<Sentido>('nada')
  const [texto, setTexto] = useState('')
  if (!turnos) return null
  const ronda = tanda.ronda_actual
  const propuestas = turnos.propuestas
  const recibidas = propuestas.filter((p) => p.con === yo)
  const mia = propuestas.find((p) => p.de === yo) ?? null
  const puedo = mio !== null && intercambiable(mio, ronda)
  const candidatos = miembros.filter((m) => m.direccion !== yo && intercambiable(m, ronda))
  const otro = candidatos.find((m) => m.direccion === con) ?? null
  const cantidad = sentido === 'nada' ? 0n : parseMonto(texto)
  const compensacion = cantidad === null ? null : sentido === 'cobro' ? -cantidad : cantidad
  const listo = otro !== null && compensacion !== null && (sentido === 'nada' || (cantidad ?? 0n) > 0n)
  const turnoDe = (dir: string) => miembros.find((m) => m.direccion === dir)?.posicion ?? 0

  const textoCompensacion = (c: bigint, de: string) =>
    c > 0n ? `${de} paga ${monto(c)} ${SIMBOLO}` : c < 0n ? `${de} pide ${monto(-c)} ${SIMBOLO}` : 'sin compensación'

  return (
    <>
      {recibidas.map((p) => (
        <div key={p.de} className="propuesta recibida">
          <p>
            <strong>{nombreDe(p.de)}</strong> te propone cambiar su turno {turnoDe(p.de) + 1} por tu turno {turnoDe(p.con) + 1}
            {' · '}
            {p.compensacion > 0n
              ? `te paga ${monto(p.compensacion)} ${SIMBOLO}`
              : p.compensacion < 0n
                ? `te pide ${monto(-p.compensacion)} ${SIMBOLO}`
                : 'sin compensación'}
            .
          </p>
          {puedeFirmar && yo && (
            <div className="fila-botones">
              <button
                className="boton principal"
                disabled={ocupado}
                onClick={() =>
                  ejecutar((c) => c.aceptar_intercambio({ id, con: yo, de: p.de }), 'Listo: cambiaron de turno.')
                }
              >
                Aceptar el cambio
              </button>
              <button
                className="boton chico"
                disabled={ocupado}
                onClick={() =>
                  ejecutar((c) => c.cancelar_propuesta({ id, de: p.de, quien: yo }), 'Rechazaste la propuesta.')
                }
              >
                Rechazar
              </button>
            </div>
          )}
        </div>
      ))}

      {mia && (
        <div className="propuesta">
          <p>
            Propusiste a <strong>{nombreDe(mia.con)}</strong> cambiar tu turno {turnoDe(mia.de) + 1} por su turno{' '}
            {turnoDe(mia.con) + 1} ({textoCompensacion(mia.compensacion, 'tú')}). Esperando respuesta.
          </p>
          {puedeFirmar && yo && (
            <div className="fila-botones">
              <button
                className="boton chico"
                disabled={ocupado}
                onClick={() =>
                  ejecutar(
                    (c) => c.cancelar_propuesta({ id, de: yo, quien: yo }),
                    mia.compensacion > 0n ? 'Retiraste la propuesta y te devolvimos la compensación.' : 'Retiraste la propuesta.',
                  )
                }
              >
                Retirar mi propuesta
              </button>
            </div>
          )}
        </div>
      )}

      {puedo && !mia && puedeFirmar && yo && mio && candidatos.length > 0 && (
        <div className="propuesta">
          <div className="campo">
            <label htmlFor="intercambio-con">Cambiar mi turno ({mio.posicion + 1}) por el de</label>
            <select id="intercambio-con" value={con} onChange={(e) => setCon(e.target.value)}>
              <option value="">Elige a alguien…</option>
              {candidatos.map((m) => (
                <option key={m.direccion} value={m.direccion}>
                  Turno {m.posicion + 1}: {nombreDe(m.direccion)}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="intercambio-sentido">Compensación</label>
            <select id="intercambio-sentido" value={sentido} onChange={(e) => setSentido(e.target.value as Sentido)}>
              <option value="nada">Sin compensación</option>
              <option value="pago">Yo pago</option>
              <option value="cobro">Que me paguen</option>
            </select>
            {sentido !== 'nada' && (
              <div className="con-sufijo">
                <input
                  aria-label="Monto de la compensación"
                  inputMode="decimal"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <span>{SIMBOLO}</span>
              </div>
            )}
            <p className="ayuda">
              {sentido === 'pago'
                ? 'Lo que pagas queda guardado en el contrato hasta que acepten (o retires la propuesta).'
                : sentido === 'cobro'
                  ? 'La otra persona te paga al aceptar.'
                  : 'Tu garantía no cambia: si adelantas tu turno, al cobrar se aparta lo que falte de tu bolsa.'}
            </p>
          </div>
          <button
            className="boton secundario"
            disabled={!listo || ocupado}
            onClick={() =>
              otro &&
              compensacion !== null &&
              ejecutar(
                (c) => c.proponer_intercambio({ id, de: yo, con: otro.direccion, compensacion }),
                `Listo: le propusiste el cambio a ${nombreDe(otro.direccion)}.`,
              )
            }
          >
            Proponer intercambio
          </button>
        </div>
      )}

      {!mia && recibidas.length === 0 && (!puedo || candidatos.length === 0) && (
        <p className="explica">
          Dos personas que aún no cobran pueden intercambiar sus turnos futuros, con una compensación si se ponen de acuerdo.
        </p>
      )}
    </>
  )
}
