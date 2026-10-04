// Formulario para crear una tanda, con vista previa de lo que va a pasar antes de firmar.
// Flujo: crear_tanda (firma 1), requisitos de historial si se eligieron (firma extra, M2) y, si la
// persona quiere, unirse como primera (última firma).
import { useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import { BotonesEntrar } from '../components/BotonesEntrar'
import { OpcionesTurnos } from '../components/OpcionesTurnos'
import { OpcionesHistorial } from '../components/OpcionesHistorial'
import { SIN_REQUISITOS, hayRequisitos, puntajeDe } from '../lib/historial'
import { useHistorialCacheado } from '../hooks/useHistorial'
import { clienteFirma, enviar, traducirError } from '../lib/contrato'
import {
  MAX_MIEMBROS,
  MAX_PENALIDAD_BPS,
  MIN_MIEMBROS,
  bolsa,
  riesgoMaximo,
  tablaColateral,
  validarParametros,
  type ParametrosTanda,
} from '../lib/colateral'
import { aSegundos, parseMonto, type UnidadPeriodo } from '../lib/entradas'
import { duracion, fechaLarga, monto } from '../lib/formato'
import { RUTA_LOBBY, irA, rutaTanda } from '../lib/rutas'
import { SIMBOLO, TOKEN_ID } from '../config'
import {
  OPCIONES_CLASICAS,
  aContrato,
  esClasica,
  garantiaAlUnirse,
  turnoAlCrear,
  validarOpciones,
  type OpcionesForm,
} from '../lib/turnos'

type Formulario = {
  cuota: string
  n: number
  periodo: string
  unidad: UnidadPeriodo
  multa: number // %
  cobertura: number // %
}

const INICIAL: Formulario = { cuota: '100', n: 3, periodo: '1', unidad: 'minutos', multa: 10, cobertura: 100 }

const PRESETS: { nombre: string; detalle: string; valores: Formulario }[] = [
  { nombre: 'Demo rápida', detalle: '3 personas · 1 min por ronda', valores: INICIAL },
  {
    nombre: 'Semanal × 4',
    detalle: '4 personas · una ronda por semana (1 mes en total)',
    valores: { cuota: '25', n: 4, periodo: '1', unidad: 'semanas', multa: 5, cobertura: 100 },
  },
  {
    nombre: 'Quincenal × 6',
    detalle: '6 personas · una ronda cada 15 días (3 meses en total)',
    valores: { cuota: '50', n: 6, periodo: '15', unidad: 'dias', multa: 5, cobertura: 100 },
  },
  {
    nombre: 'Mensual × 6',
    detalle: '6 personas · una ronda por mes (6 meses en total)',
    valores: { cuota: '50', n: 6, periodo: '1', unidad: 'meses', multa: 5, cobertura: 100 },
  },
  {
    nombre: 'Mensual × 12',
    detalle: '12 personas · una ronda por mes (1 año en total)',
    valores: { cuota: '50', n: 12, periodo: '1', unidad: 'meses', multa: 5, cobertura: 100 },
  },
]

type Progreso =
  | { tipo: 'ninguno' }
  | { tipo: 'trabajando'; texto: string }
  | { tipo: 'error'; texto: string }
  | { tipo: 'creada-sin-unirse'; id: number; texto: string }

export function CrearTanda({ billetera, saldo }: { billetera: Billetera; saldo: bigint | null }) {
  const [f, setF] = useState<Formulario>(INICIAL)
  const [unirmeYo, setUnirmeYo] = useState(true)
  const [turnos, setTurnos] = useState<OpcionesForm>(OPCIONES_CLASICAS)
  const [requisitos, setRequisitos] = useState(SIN_REQUISITOS)
  const [progreso, setProgreso] = useState<Progreso>({ tipo: 'ninguno' })

  const yo = billetera.direccion
  const cuota = parseMonto(f.cuota)
  const periodoSeg = aSegundos(Number(f.periodo), f.unidad)

  const parciales: Partial<ParametrosTanda> = {
    cuota: cuota ?? undefined,
    nMiembros: f.n,
    periodoSeg: periodoSeg ?? undefined,
    penalidadBps: f.multa * 100,
    coberturaBps: f.cobertura * 100,
  }
  const errores = validarParametros(parciales)
  const errorTurnos = validarOpciones(turnos, f.n)
  const valido = Object.keys(errores).length === 0
  const params = valido ? (parciales as ParametrosTanda) : null
  const trabajando = progreso.tipo === 'trabajando'
  // Quien crea y se une primero toma el turno 1 (en sorteo y subasta, solo deja una cuota).
  // Si los primeros turnos piden un historial que no tiene, queda en el primero que no lo pide (M2 + M3).
  const miHistorial = useHistorialCacheado(yo ?? '')
  const turnoPropio = turnoAlCrear(turnos, miHistorial ? puntajeDe(miHistorial) : 0)
  const garantiaPropia = params ? garantiaAlUnirse(params, turnos.modo, turnoPropio) : 0n
  const faltaSaldo = unirmeYo && saldo !== null && saldo < garantiaPropia ? garantiaPropia - saldo : 0n

  const duracionTotal = params ? params.periodoSeg * params.nMiembros : 0
  const [hoy] = useState(() => Math.floor(Date.now() / 1000))
  // Para rondas de días, semanas o meses ayuda ver la fecha en que terminaría si se llena hoy.
  const fechaFin = params && params.periodoSeg >= 86_400 ? fechaLarga(hoy + duracionTotal, hoy) : null

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setF((prev) => ({ ...prev, [campo]: valor }))
    if (progreso.tipo === 'error') setProgreso({ tipo: 'ninguno' })
  }

  async function crear() {
    if (!yo || !params) return
    setProgreso({ tipo: 'trabajando', texto: 'Confirma en Freighter para crear la tanda…' })

    let id: number
    try {
      const datos = {
        creador: yo,
        token: TOKEN_ID,
        cuota: params.cuota,
        n_miembros: params.nMiembros,
        periodo_seg: BigInt(params.periodoSeg),
        penalidad_bps: params.penalidadBps,
        cobertura_bps: params.coberturaBps,
      }
      // Por orden de llegada y sin intercambios: la tanda de siempre. Si no, con sus opciones de turnos.
      const tx = esClasica(turnos)
        ? await clienteFirma(yo).crear_tanda(datos)
        : await clienteFirma(yo).crear_tanda_avanzada({ ...datos, opciones: aContrato(turnos) })
      const resultado = await enviar(tx)
      if (resultado.isErr()) throw new Error('El contrato rechazó los datos de la tanda.')
      id = resultado.unwrap()
    } catch (e) {
      setProgreso({ tipo: 'error', texto: traducirError(e) })
      return
    }

    if (hayRequisitos(requisitos)) {
      setProgreso({ tipo: 'trabajando', texto: `Tanda ${id} creada. Confirma otra vez para guardar los requisitos de historial…` })
      try {
        await enviar(await clienteFirma(yo).configurar_requisitos({ id, ...requisitos }))
      } catch (e) {
        setProgreso({
          tipo: 'creada-sin-unirse',
          id,
          texto: `La tanda ${id} sí se creó, pero no pudimos guardar los requisitos de historial: ${traducirError(e)}`,
        })
        return
      }
    }

    if (!unirmeYo) {
      irA(rutaTanda(id))
      return
    }

    setProgreso({ tipo: 'trabajando', texto: `Tanda ${id} creada. Confirma otra vez en Freighter para unirte como primera persona…` })
    try {
      const tx = await clienteFirma(yo).unirse({ id, miembro: yo })
      await enviar(tx)
      irA(rutaTanda(id))
    } catch (e) {
      setProgreso({
        tipo: 'creada-sin-unirse',
        id,
        texto: `La tanda ${id} sí se creó, pero no pudimos unirte: ${traducirError(e)}`,
      })
    }
  }

  return (
    <section className="crear" aria-labelledby="crear-titulo">
      <p className="migas">
        <a href={RUTA_LOBBY}>← Todas las tandas</a>
      </p>
      <div className="selector">
        <h1 id="crear-titulo">Crear una tanda</h1>
      </div>
      <p className="explica lobby-intro">
        Defines las reglas una sola vez y el contrato las cumple solo. Después compartes el link para que se unan.
      </p>

      <div className="presets" role="group" aria-label="Empezar desde un ejemplo">
        <span className="presets-titulo">Empezar desde un ejemplo:</span>
        {PRESETS.map((p) => (
          <button key={p.nombre} type="button" className="boton chico" onClick={() => setF(p.valores)} title={p.detalle}>
            {p.nombre}
          </button>
        ))}
      </div>

      <div className="escenario crear-columnas">
        <form
          className="panel formulario"
          onSubmit={(e) => {
            e.preventDefault()
            void crear()
          }}
        >
          <div className="campo">
            <label htmlFor="cuota">Cuota por ronda</label>
            <div className="con-sufijo">
              <input
                id="cuota"
                inputMode="decimal"
                value={f.cuota}
                onChange={(e) => cambiar('cuota', e.target.value)}
                aria-invalid={errores.cuota ? true : undefined}
                aria-describedby="cuota-ayuda"
              />
              <span>{SIMBOLO}</span>
            </div>
            <p id="cuota-ayuda" className={errores.cuota ? 'ayuda error' : 'ayuda'}>
              {errores.cuota ?? 'Lo que paga cada persona en cada ronda.'}
            </p>
          </div>

          <div className="campo">
            <label htmlFor="n">
              Personas: <strong>{f.n}</strong>
            </label>
            <input
              id="n"
              type="range"
              min={MIN_MIEMBROS}
              max={MAX_MIEMBROS}
              value={f.n}
              onChange={(e) => cambiar('n', Number(e.target.value))}
            />
            <p className="ayuda">
              Entre {MIN_MIEMBROS} y {MAX_MIEMBROS}. Hay una ronda por persona.
            </p>
          </div>

          <div className="campo">
            <label htmlFor="periodo">Duración de cada ronda</label>
            <div className="fila-campo">
              <input
                id="periodo"
                inputMode="numeric"
                value={f.periodo}
                onChange={(e) => cambiar('periodo', e.target.value)}
                aria-invalid={errores.periodoSeg ? true : undefined}
                aria-describedby="periodo-ayuda"
              />
              <select
                aria-label="Unidad de tiempo"
                value={f.unidad}
                onChange={(e) => cambiar('unidad', e.target.value as UnidadPeriodo)}
              >
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
                <option value="dias">días</option>
                <option value="semanas">semanas</option>
                <option value="meses">meses</option>
              </select>
            </div>
            <p id="periodo-ayuda" className={errores.periodoSeg ? 'ayuda error' : 'ayuda'}>
              {errores.periodoSeg ??
                `Quien paga después de este plazo cuenta como atrasado. Hasta 3 meses por ronda${
                  f.unidad === 'meses' ? ' (1 mes = 30 días)' : ''
                }.`}
            </p>
          </div>

          <div className="campo">
            <label htmlFor="multa">
              Multa por atraso: <strong>{f.multa} %</strong> de la cuota
            </label>
            <input
              id="multa"
              type="range"
              min={0}
              max={MAX_PENALIDAD_BPS / 100}
              value={f.multa}
              onChange={(e) => cambiar('multa', Number(e.target.value))}
            />
            <p className="ayuda">
              Se descuenta de la garantía al final y se reparte entre quienes nunca se atrasaron.
              {cuota !== null && f.multa > 0 && (
                <>
                  {' '}
                  Con tu cuota son {monto((cuota * BigInt(f.multa)) / 100n)} {SIMBOLO} por atraso.
                </>
              )}
            </p>
          </div>

          <div className="campo">
            <label htmlFor="cobertura">
              Garantía: <strong>{f.cobertura} %</strong> de lo que aún se debe
            </label>
            <input
              id="cobertura"
              type="range"
              min={0}
              max={100}
              step={5}
              value={f.cobertura}
              onChange={(e) => cambiar('cobertura', Number(e.target.value))}
            />
            <p className="ayuda">
              Quien cobra antes deja más garantía. Con 100 % nadie gana nada huyendo; con menos es más barato entrar, pero
              el grupo asume algo de riesgo.
            </p>
          </div>

          <OpcionesTurnos params={params} valor={turnos} alCambiar={setTurnos} error={errorTurnos} />
          <OpcionesHistorial valor={requisitos} alCambiar={setRequisitos} yo={yo} unirmeYo={unirmeYo} />

          <label className="casilla">
            <input type="checkbox" checked={unirmeYo} onChange={(e) => setUnirmeYo(e.target.checked)} />
            <span>
              Unirme yo también, como primera persona
              {params && unirmeYo && (
                <span className="ayuda">
                  {' '}
                  (dejarás {monto(garantiaPropia)} {SIMBOLO} de garantía
                  {turnos.modo === 'Sorteo'
                    ? '; tu turno se sortea al llenarse'
                    : turnos.modo === 'Subasta'
                      ? '; tu turno se decide en las subastas'
                      : ` y cobrarás en la ronda ${turnoPropio + 1}`}
                  )
                </span>
              )}
            </span>
          </label>

          <div className="acciones">
            {!yo ? (
              <>
                <p>Entra o conecta tu billetera para crear la tanda.</p>
                <BotonesEntrar billetera={billetera} />
              </>
            ) : !billetera.redCorrecta ? (
              <p className="aviso error">Freighter está en otra red. Cámbiala a Testnet para continuar.</p>
            ) : (
              <button
                type="submit"
                className="boton principal"
                disabled={!valido || errorTurnos !== null || trabajando || faltaSaldo > 0n}
              >
                {trabajando ? 'Esperando…' : unirmeYo ? 'Crear la tanda y unirme' : 'Crear la tanda'}
              </button>
            )}
            {faltaSaldo > 0n && (
              <p className="aviso nota">
                Para unirte como primera persona necesitas {monto(garantiaPropia)} {SIMBOLO} y te faltan {monto(faltaSaldo)} {SIMBOLO}.
                Pide más con el botón de arriba o desmarca "Unirme yo también".
              </p>
            )}
            <p className="explica">
              Cualquier persona con el link podrá unirse.{' '}
              {turnos.modo === 'Llegada'
                ? 'El orden de llegada decide el turno: quien entra primero cobra primero y deja más garantía.'
                : 'El turno lo decide el mecanismo que elegiste arriba, no el orden de llegada.'}
            </p>
          </div>

          {progreso.tipo === 'trabajando' && (
            <p className="aviso esperando" role="status" aria-live="polite">
              {progreso.texto}
            </p>
          )}
          {progreso.tipo === 'error' && (
            <p className="aviso error" role="alert">
              {progreso.texto}
            </p>
          )}
          {progreso.tipo === 'creada-sin-unirse' && (
            <p className="aviso error" role="alert">
              {progreso.texto}{' '}
              <a href={rutaTanda(progreso.id)}>Ir a la tanda {progreso.id}</a>
            </p>
          )}
        </form>

        <aside className="panel vista-previa" aria-labelledby="previa-titulo">
          <h2 id="previa-titulo">Así va a funcionar</h2>
          {params ? (
            <>
              <dl className="datos">
                <div className="dato">
                  <dt>Bolsa por ronda</dt>
                  <dd>
                    {monto(bolsa(params))} {SIMBOLO}
                  </dd>
                </div>
                <div className="dato">
                  <dt>Dura en total</dt>
                  <dd>{duracion(duracionTotal)}</dd>
                </div>
              </dl>
              {fechaFin && (
                <p className="explica">
                  Las fechas de pago quedan fijas desde que se completa el grupo. Si se llena hoy, la última ronda vence
                  el {fechaFin}.
                </p>
              )}

              <h3>Garantía de cada turno</h3>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Turno</th>
                      <th scope="col">Cobra</th>
                      <th scope="col" className="num">
                        Garantía ({SIMBOLO})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaColateral(params).map((c, i) => (
                      <tr key={i}>
                        <td className="turno">{i + 1}</td>
                        <td>Ronda {i + 1}</td>
                        <td className="num">{monto(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="explica">
                La garantía se guarda en una bóveda que genera rendimiento y se devuelve al final. Si alguien desaparece,
                su garantía paga por él.
              </p>

              <RiesgoGrupo params={params} />

            </>
          ) : (
            <p className="explica">Completa los datos de la izquierda para ver la vista previa.</p>
          )}
        </aside>
      </div>
    </section>
  )
}

function RiesgoGrupo({ params }: { params: ParametrosTanda }) {
  const riesgo = riesgoMaximo(params)
  if (riesgo === 0n) {
    return (
      <p className="aviso listo">
        Con esta garantía, si alguien cobra y desaparece, su garantía cubre todo lo que aún debe: el grupo no pierde nada.
      </p>
    )
  }
  return (
    <p className="aviso nota">
      Con esta garantía, si quien cobra primero desaparece, el grupo podría perder hasta {monto(riesgo)} {SIMBOLO}. Sube la
      garantía a 100 % para eliminar ese riesgo.
    </p>
  )
}
