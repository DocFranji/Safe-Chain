// Crear una tanda en 3 preguntas: ¿cuánto pone cada quien?, ¿cuántas personas?, ¿cada cuánto?
// Todo lo demás (moneda, otra duración, multa, depósito, turnos e historial) tiene valores por defecto
// sensatos y queda plegado en "Opciones avanzadas". El resumen en palabras, con fechas reales, es lo que
// la persona lee antes de confirmar.
// Flujo de firmas: crear_tanda (o crear_tanda_avanzada; con nombre, crear_tanda_con_nombre), los requisitos de historial si se eligieron (M2) y,
// si la persona quiere (viene marcado), unirse como primera. Al terminar va a la página de la tanda, que la
// recibe con la invitación lista para WhatsApp.
import { useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import { BotonesEntrar } from '../components/BotonesEntrar'
import { OpcionesTurnos } from '../components/OpcionesTurnos'
import { OpcionesHistorial } from '../components/OpcionesHistorial'
import { SIN_REQUISITOS, hayRequisitos, puntajeDe } from '../lib/historial'
import { useHistorialCacheado } from '../hooks/useHistorial'
import { useSoportaNombres } from '../hooks/useSoportaNombres'
import { idDeCreacion, limpiarNombre } from '../lib/nombreCrear'
import { NOMBRE_MAX, errorNombre } from '../lib/nombreTanda'
import { clienteFirma, enviar, traducirError } from '../lib/contrato'
import {
  MAX_MIEMBROS,
  MAX_PENALIDAD_BPS,
  MIN_MIEMBROS,
  multaPorAtraso,
  riesgoMaximo,
  tablaColateral,
  validarParametros,
  type ParametrosTanda,
} from '../lib/colateral'
import { aSegundos, parseMonto, type UnidadPeriodo } from '../lib/entradas'
import { duracion, fechaLarga } from '../lib/formato'
import { dinero } from '../lib/glosario'
import { FRECUENCIAS, cadaCuanto, fraseTanda, type Frecuencia } from '../lib/resumen'
import { RUTA_LOBBY, irA, rutaTanda } from '../lib/rutas'
import { marcarRecienCreada } from '../lib/recienCreada'
import { OpcionesMoneda } from '../components/OpcionesMoneda'
import { MonedaContexto, useSaldoEn } from '../hooks/useMoneda'
import { TUSD, type Moneda } from '../lib/monedas'
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
  /** 'otra' = la duración que se escribe a mano en "Opciones avanzadas" (por ejemplo, 1 minuto para probar). */
  frecuencia: Frecuencia | 'otra'
  periodo: string
  unidad: UnidadPeriodo
  multa: number // %
  cobertura: number // %
}

const BASE: Omit<Formulario, 'cuota' | 'n' | 'frecuencia'> = { periodo: '1', unidad: 'semanas', multa: 5, cobertura: 100 }

/** Plantillas de un clic. La primera es la de por defecto. */
const PLANTILLAS: { nombre: string; valores: Formulario }[] = [
  { nombre: 'Entre amigos, semanal', valores: { ...BASE, cuota: '20', n: 5, frecuencia: 'semanal' } },
  { nombre: 'Familia, mensual', valores: { ...BASE, cuota: '50', n: 6, frecuencia: 'mensual' } },
  { nombre: 'Compañeros, quincenal', valores: { ...BASE, cuota: '25', n: 8, frecuencia: 'quincenal' } },
  // Para la demo y para probar: turnos de 1 minuto (la bóveda de las tandas de prueba rinde más rápido).
  {
    nombre: 'Prueba rápida (1 minuto)',
    valores: { cuota: '100', n: 3, frecuencia: 'otra', periodo: '1', unidad: 'minutos', multa: 10, cobertura: 100 },
  },
]

const INICIAL = PLANTILLAS[0].valores

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
  // (v5, pedido 5) El nombre es opcional y solo se ofrece si el contrato desplegado lo guarda.
  const aceptaNombres = useSoportaNombres() === true
  const [nombreEscrito, setNombreEscrito] = useState('')
  // M4: moneda de la tanda (TUSD simulado o USDC de Blend con rendimiento real).
  const [moneda, setMoneda] = useState<Moneda>(TUSD)
  // "Opciones avanzadas" se abre solo si la persona lo pide (o si una plantilla usa una duración propia).
  const [avanzadas, setAvanzadas] = useState(false)

  const yo = billetera.direccion
  const saldoMoneda = useSaldoEn(moneda, yo, saldo)
  const cuota = parseMonto(f.cuota)
  const periodoSeg =
    f.frecuencia === 'otra' ? aSegundos(Number(f.periodo), f.unidad) : FRECUENCIAS.find((x) => x.id === f.frecuencia)!.segundos

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
  const nombre = aceptaNombres ? limpiarNombre(nombreEscrito) : ''
  const problemaNombre = errorNombre(nombre)
  // Quien crea y se une primero toma el turno 1 (en sorteo y subasta, solo deja una cuota).
  // Si los primeros turnos piden un historial que no tiene, queda en el primero que no lo pide (M2 + M3).
  const miHistorial = useHistorialCacheado(yo ?? '')
  const turnoPropio = turnoAlCrear(turnos, miHistorial ? puntajeDe(miHistorial) : 0)
  const garantiaPropia = params ? garantiaAlUnirse(params, turnos.modo, turnoPropio) : 0n
  const faltaSaldo = unirmeYo && saldoMoneda !== null && saldoMoneda < garantiaPropia ? garantiaPropia - saldoMoneda : 0n
  const conGoogle = billetera.tipo === 'google'

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setF((prev) => ({ ...prev, [campo]: valor }))
    if (progreso.tipo === 'error') setProgreso({ tipo: 'ninguno' })
  }

  function usarPlantilla(valores: Formulario) {
    setF(valores)
    if (valores.frecuencia === 'otra') setAvanzadas(true)
    if (progreso.tipo === 'error') setProgreso({ tipo: 'ninguno' })
  }

  /** Lo que se le dice a la persona mientras confirma: con Google no hay ventana que aprobar. */
  const esperando = (que: string) => (conGoogle ? `Un momento: ${que}…` : `Confirma en Freighter: ${que}…`)

  async function crear() {
    if (!yo || !params) return
    setProgreso({ tipo: 'trabajando', texto: esperando('estamos creando tu tanda') })

    let id: number
    try {
      const datos = {
        creador: yo,
        token: moneda.token,
        cuota: params.cuota,
        n_miembros: params.nMiembros,
        periodo_seg: BigInt(params.periodoSeg),
        penalidad_bps: params.penalidadBps,
        cobertura_bps: params.coberturaBps,
      }
      // Por orden de llegada y sin intercambios: la tanda de siempre. Si no, con sus opciones de turnos.
      // Con nombre se usan las dos funciones "con_nombre" del contrato nuevo; sin nombre, las de siempre.
      let resultado: unknown
      if (nombre) {
        const c = clienteFirma(yo)
        resultado = await enviar(
          esClasica(turnos)
            ? await c.crear_tanda_con_nombre({ ...datos, nombre })
            : await c.crear_tanda_avanzada_con_nombre({ ...datos, opciones: aContrato(turnos), nombre }),
        )
      } else {
        resultado = await enviar(
          esClasica(turnos)
            ? await clienteFirma(yo).crear_tanda(datos)
            : await clienteFirma(yo).crear_tanda_avanzada({ ...datos, opciones: aContrato(turnos) }),
        )
      }
      id = idDeCreacion(resultado)
    } catch (e) {
      setProgreso({ tipo: 'error', texto: traducirError(e) })
      return
    }

    if (hayRequisitos(requisitos)) {
      setProgreso({ tipo: 'trabajando', texto: esperando('guardamos los requisitos de reputación') })
      try {
        await enviar(await clienteFirma(yo).configurar_requisitos({ id, ...requisitos }))
      } catch (e) {
        setProgreso({
          tipo: 'creada-sin-unirse',
          id,
          texto: `La tanda ${id} sí se creó, pero no pudimos guardar los requisitos de reputación: ${traducirError(e)}`,
        })
        return
      }
    }

    if (unirmeYo) {
      setProgreso({ tipo: 'trabajando', texto: esperando('te estamos uniendo como primera persona') })
      try {
        await enviar(await clienteFirma(yo).unirse({ id, miembro: yo }))
      } catch (e) {
        setProgreso({
          tipo: 'creada-sin-unirse',
          id,
          texto: `La tanda ${id} sí se creó, pero no pudimos unirte: ${traducirError(e)}`,
        })
        return
      }
    }

    // La página de la tanda recibe a quien la creó con "¡Tu tanda está lista!" y la invitación.
    marcarRecienCreada(id)
    irA(rutaTanda(id))
  }

  return (
    <MonedaContexto.Provider value={moneda}>
      <section className="crear" aria-labelledby="crear-titulo">
        <p className="migas">
          <a href={RUTA_LOBBY}>← Todas las tandas</a>
        </p>
        <div className="selector">
          <h1 id="crear-titulo">Crear una tanda</h1>
        </div>
        <p className="explica lobby-intro">
          Responde 3 preguntas. Rounda cobra a cada quien y le entrega el pozo a quien le toca, sin que nadie tenga que
          perseguir a nadie.
        </p>

        <div className="presets" role="group" aria-label="Empezar desde una plantilla">
          <span className="presets-titulo">Plantillas:</span>
          {PLANTILLAS.map((p) => (
            <button
              key={p.nombre}
              type="button"
              className={f === p.valores ? 'filtro activo' : 'filtro'}
              aria-pressed={f === p.valores}
              onClick={() => usarPlantilla(p.valores)}
            >
              {p.nombre}
            </button>
          ))}
        </div>

        <form
          className="escenario crear-columnas"
          onSubmit={(e) => {
            e.preventDefault()
            void crear()
          }}
        >
          <div className="panel formulario">
            <div className="campo pregunta">
              <label htmlFor="cuota">
                <span className="pregunta-numero">1</span> ¿Cuánto pone cada quien?
              </label>
              <div className="con-prefijo">
                <span aria-hidden="true">$</span>
                <input
                  id="cuota"
                  inputMode="decimal"
                  value={f.cuota}
                  onChange={(e) => cambiar('cuota', e.target.value)}
                  aria-invalid={errores.cuota ? true : undefined}
                  aria-describedby="cuota-ayuda"
                />
              </div>
              <p id="cuota-ayuda" className={errores.cuota ? 'ayuda error' : 'ayuda'}>
                {errores.cuota ?? 'La cuota: lo mismo para todas las personas, en cada turno. Son dólares de práctica.'}
              </p>
            </div>

            <div className="campo pregunta">
              <label htmlFor="n">
                <span className="pregunta-numero">2</span> ¿Cuántas personas?
              </label>
              <div className="contador">
                <button
                  type="button"
                  className="boton secundario"
                  aria-label="Una persona menos"
                  disabled={f.n <= MIN_MIEMBROS}
                  onClick={() => cambiar('n', Math.max(MIN_MIEMBROS, f.n - 1))}
                >
                  −
                </button>
                <input
                  id="n"
                  type="number"
                  inputMode="numeric"
                  min={MIN_MIEMBROS}
                  max={MAX_MIEMBROS}
                  value={f.n}
                  onChange={(e) => cambiar('n', Math.min(MAX_MIEMBROS, Math.max(MIN_MIEMBROS, Number(e.target.value) || MIN_MIEMBROS)))}
                />
                <button
                  type="button"
                  className="boton secundario"
                  aria-label="Una persona más"
                  disabled={f.n >= MAX_MIEMBROS}
                  onClick={() => cambiar('n', Math.min(MAX_MIEMBROS, f.n + 1))}
                >
                  +
                </button>
              </div>
              <p className="ayuda">
                Contándote a ti. Entre {MIN_MIEMBROS} y {MAX_MIEMBROS}: cada persona cobra una vez.
              </p>
            </div>

            <fieldset className="campo pregunta">
              <legend>
                <span className="pregunta-numero">3</span> ¿Cada cuánto?
              </legend>
              <div className="frecuencias">
                {FRECUENCIAS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={f.frecuencia === x.id ? 'filtro activo' : 'filtro'}
                    aria-pressed={f.frecuencia === x.id}
                    onClick={() => cambiar('frecuencia', x.id)}
                  >
                    {x.boton}
                  </button>
                ))}
              </div>
              <p className={f.frecuencia === 'otra' && errores.periodoSeg ? 'ayuda error' : 'ayuda'}>
                {f.frecuencia === 'otra'
                  ? (errores.periodoSeg ?? `Otra duración: ${periodoSeg ? cadaCuanto(periodoSeg) : '-'} (en "Opciones avanzadas").`)
                  : 'Cada cuánto paga cada quien su cuota.'}
              </p>
            </fieldset>

            {aceptaNombres && (
              <div className="campo">
                <label htmlFor="nombre-tanda">Nombre de la tanda (opcional)</label>
                <input
                  id="nombre-tanda"
                  autoComplete="off"
                  placeholder="Por ejemplo: Tanda de la oficina"
                  value={nombreEscrito}
                  onChange={(e) => setNombreEscrito(e.target.value)}
                  aria-invalid={problemaNombre ? true : undefined}
                  aria-describedby="nombre-tanda-ayuda"
                />
                <p id="nombre-tanda-ayuda" className={problemaNombre ? 'ayuda error' : 'ayuda'}>
                  {problemaNombre ??
                    `De 2 a ${NOMBRE_MAX} caracteres${nombre ? ` (llevas ${[...nombre].length})` : ''}. Lo verá cualquiera que vea la tanda y no se podrá cambiar después. Sin nombre se llama «Tanda 5», con su número.`}
                </p>
              </div>
            )}

            <details className="avanzadas" open={avanzadas} onToggle={(e) => setAvanzadas(e.currentTarget.open)}>
              <summary>Opciones avanzadas</summary>
              <p className="ayuda">Ya vienen con valores pensados para la mayoría de los grupos. No hace falta tocarlas.</p>

              <OpcionesMoneda valor={moneda} alCambiar={setMoneda} />

              <div className="campo">
                <label htmlFor="periodo">Otra duración para cada turno</label>
                <div className="fila-campo">
                  <input
                    id="periodo"
                    inputMode="numeric"
                    value={f.periodo}
                    onChange={(e) => setF((prev) => ({ ...prev, periodo: e.target.value, frecuencia: 'otra' }))}
                    aria-invalid={f.frecuencia === 'otra' && errores.periodoSeg ? true : undefined}
                    aria-describedby="periodo-ayuda"
                  />
                  <select
                    aria-label="Unidad de tiempo"
                    value={f.unidad}
                    onChange={(e) => setF((prev) => ({ ...prev, unidad: e.target.value as UnidadPeriodo, frecuencia: 'otra' }))}
                  >
                    <option value="minutos">minutos</option>
                    <option value="horas">horas</option>
                    <option value="dias">días</option>
                    <option value="semanas">semanas</option>
                    <option value="meses">meses</option>
                  </select>
                </div>
                <p id="periodo-ayuda" className={f.frecuencia === 'otra' && errores.periodoSeg ? 'ayuda error' : 'ayuda'}>
                  {(f.frecuencia === 'otra' && errores.periodoSeg) ||
                    `Reemplaza a "¿Cada cuánto?". Hasta 3 meses por turno${f.unidad === 'meses' ? ' (1 mes = 30 días)' : ''}. Con minutos sirve para probar.`}
                </p>
              </div>

              <div className="campo">
                <label htmlFor="multa">
                  Multa por pagar tarde: <strong>{f.multa} %</strong> de la cuota
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
                  Se descuenta del depósito al final y se reparte entre quienes nunca se atrasaron.
                  {cuota !== null && f.multa > 0 && <> Con esta cuota son {dinero((cuota * BigInt(f.multa)) / 100n)}.</>}
                </p>
              </div>

              <div className="campo">
                <label htmlFor="cobertura">
                  Depósito de seguridad: <strong>{f.cobertura} %</strong> de lo que aún se debe
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
                  Quien cobra antes deja más depósito. Con 100 % nadie gana nada desapareciendo; con menos es más barato
                  entrar, pero el grupo asume algo de riesgo.
                </p>
              </div>

              <OpcionesTurnos params={params} valor={turnos} alCambiar={setTurnos} error={errorTurnos} />
              <OpcionesHistorial valor={requisitos} alCambiar={setRequisitos} yo={yo} unirmeYo={unirmeYo} />
            </details>
          </div>

          <aside className="panel vista-previa" aria-labelledby="previa-titulo">
            <h2 id="previa-titulo">Así va a funcionar</h2>
            {params ? (
              <Resumen
                params={params}
                unirmeYo={unirmeYo}
                garantiaPropia={garantiaPropia}
                turnoPropio={turnoPropio}
                modo={turnos.modo}
              />
            ) : (
              <p className="explica">Responde las 3 preguntas para ver cómo va a funcionar.</p>
            )}

            <label className="casilla">
              <input type="checkbox" checked={unirmeYo} onChange={(e) => setUnirmeYo(e.target.checked)} />
              <span>
                Unirme yo también
                <span className="ayuda"> (como primera persona)</span>
              </span>
            </label>

            <div className="acciones">
              {!yo ? (
                <>
                  <p>Entra para crear la tanda.</p>
                  <BotonesEntrar billetera={billetera} />
                </>
              ) : !billetera.redCorrecta ? (
                <p className="aviso error">Freighter está en otra red. Cámbiala a Testnet para continuar.</p>
              ) : (
                <button
                  type="submit"
                  className="boton principal grande"
                  disabled={!valido || errorTurnos !== null || problemaNombre !== null || trabajando || faltaSaldo > 0n}
                >
                  {trabajando ? 'Un momento…' : unirmeYo ? 'Crear la tanda y unirme' : 'Crear la tanda'}
                </button>
              )}
              {faltaSaldo > 0n && (
                <p className="aviso nota">
                  Para unirte como primera persona necesitas {dinero(garantiaPropia)} y te faltan {dinero(faltaSaldo)}.
                  Pide más con el botón de arriba o desmarca "Unirme yo también".
                </p>
              )}
              {!valido && yo && <p className="ayuda error">Revisa las respuestas de arriba: hay algo por corregir.</p>}
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
                {progreso.texto} <a href={rutaTanda(progreso.id)}>Ir a la tanda {progreso.id}</a>
              </p>
            )}
          </aside>
        </form>
      </section>
    </MonedaContexto.Provider>
  )
}

/** El resumen en palabras, con fechas reales si los turnos duran un día o más. */
function Resumen({
  params,
  unirmeYo,
  garantiaPropia,
  turnoPropio,
  modo,
}: {
  params: ParametrosTanda
  unirmeYo: boolean
  garantiaPropia: bigint
  turnoPropio: number
  modo: OpcionesForm['modo']
}) {
  const [hoy] = useState(() => Math.floor(Date.now() / 1000))
  const { nMiembros: n, periodoSeg } = params
  const tabla = tablaColateral(params)
  const multa = multaPorAtraso(params.cuota, params.penalidadBps)
  const conFechas = periodoSeg >= 86_400
  const riesgo = riesgoMaximo(params)
  const turnoSeDecideDespues = modo === 'Sorteo' || modo === 'Subasta'

  return (
    <>
      <p className="resumen-frase">{fraseTanda({ cuota: params.cuota, n, periodoSeg })}</p>
      <ul className="resumen-lista">
        <li>
          Empieza cuando se unan las {n} personas y dura {duracion(periodoSeg * n)}: un turno para cada quien.
          {conFechas && (
            <>
              {' '}
              Si se completa hoy, el primer pago vence el {fechaLarga(hoy + periodoSeg, hoy)} y el último pago vence el{' '}
              {fechaLarga(hoy + periodoSeg * n, hoy)}.
            </>
          )}
        </li>
        <li>
          {unirmeYo ? (
            <>
              Tú dejas <strong>{dinero(garantiaPropia)}</strong> de depósito de seguridad y lo recuperas al final, con
              intereses.
              {turnoSeDecideDespues
                ? modo === 'Sorteo'
                  ? ' Tu turno se sortea cuando se llene la tanda.'
                  : ' Tu turno se decide en las subastas.'
                : ` Cobras en el turno ${turnoPropio + 1}.`}
            </>
          ) : (
            <>
              Quien cobra primero deja {dinero(tabla[0])} de depósito de seguridad; quien cobra al final,{' '}
              {dinero(tabla[tabla.length - 1])}. Cada quien lo recupera al final, con intereses.
            </>
          )}
        </li>
        <li>
          {riesgo === 0n
            ? 'Si alguien no paga, su depósito cubre su cuota: el grupo no pierde nada.'
            : `Si quien cobra primero desaparece, el grupo podría perder hasta ${dinero(riesgo)}. Sube el depósito a 100 % en "Opciones avanzadas" para eliminar ese riesgo.`}
        </li>
        {multa > 0n && <li>Pagar tarde cuesta {dinero(multa)} de multa, que se reparte entre quienes pagan a tiempo.</li>}
      </ul>

      <details className="deposito-turnos">
        <summary>¿Cuánto deja cada quien de depósito?</summary>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Turno</th>
                <th scope="col" className="num">
                  Depósito
                </th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((c, i) => (
                <tr key={i}>
                  <td className="turno">{i + 1}</td>
                  <td className="num">{dinero(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="explica">
          Quien cobra antes deja más, porque después de cobrar todavía debe cuotas. Si desaparece, su depósito paga por
          él.
        </p>
      </details>
    </>
  )
}
