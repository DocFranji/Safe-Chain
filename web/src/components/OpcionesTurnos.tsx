// Crear tanda (misión M3): cómo se decide quién cobra primero. Cinco tarjetas en lenguaje simple,
// los parámetros del modo elegido y una vista previa por turno: cuánto se deja, cuánto se aparta
// al cobrar, la prima o bonificación y cuánto se recibe. La lógica vive en lib/turnos.ts.
import type { ParametrosTanda } from '../lib/colateral'
import { MAX_DESCUENTO_BPS, MAX_PRIMA_BPS, MODOS, vistaPrevia, type Modo, type OpcionesForm } from '../lib/turnos'
import { monto } from '../lib/formato'
import { SIMBOLO } from '../config'

type Props = {
  /** Parámetros ya válidos de la tanda (null mientras el formulario tenga errores). */
  params: ParametrosTanda | null
  valor: OpcionesForm
  alCambiar: (o: OpcionesForm) => void
  error: string | null
}

export function OpcionesTurnos({ params, valor, alCambiar, error }: Props) {
  const elegido = MODOS.find((m) => m.modo === valor.modo) ?? MODOS[0]

  function elegir(modo: Modo) {
    // "Elegir e intercambiar" trae el intercambio activado; en la subasta no existe.
    alCambiar({ ...valor, modo, intercambio: modo === 'Eleccion' ? true : modo === 'Subasta' ? false : valor.intercambio })
  }

  return (
    <fieldset className="campo turnos-opciones">
      <legend>¿Cómo se decide quién cobra primero?</legend>
      <div className="modos" role="radiogroup" aria-label="Cómo se reparten los turnos">
        {MODOS.map((m) => (
          <label key={m.modo} className={m.modo === valor.modo ? 'modo elegido' : 'modo'}>
            <input
              type="radio"
              name="modo-turnos"
              value={m.modo}
              checked={m.modo === valor.modo}
              onChange={() => elegir(m.modo)}
            />
            <span className="modo-titulo">{m.titulo}</span>
            <span className="modo-lema">{m.lema}</span>
          </label>
        ))}
      </div>
      <p className="ayuda">{elegido.detalle}</p>

      {valor.modo === 'PrecioPorTurno' && (
        <div className="campo">
          <label htmlFor="prima">
            El primer turno paga: <strong>{valor.primaPct} %</strong> de la bolsa
          </label>
          <input
            id="prima"
            type="range"
            min={1}
            max={MAX_PRIMA_BPS / 100}
            value={valor.primaPct}
            onChange={(e) => alCambiar({ ...valor, primaPct: Number(e.target.value) })}
          />
          <p className="ayuda">El último turno recibe lo mismo. Los del medio pagan o reciben menos.</p>
        </div>
      )}

      {valor.modo === 'Subasta' && (
        <div className="campo">
          <label htmlFor="descuento">
            Descuento máximo por ronda: <strong>{valor.descuentoPct} %</strong> de la bolsa
          </label>
          <input
            id="descuento"
            type="range"
            min={1}
            max={MAX_DESCUENTO_BPS / 100}
            value={valor.descuentoPct}
            onChange={(e) => alCambiar({ ...valor, descuentoPct: Number(e.target.value) })}
          />
          <p className="ayuda">Nadie puede ofrecer recibir menos que esto. Así nadie se queda con muy poco.</p>
        </div>
      )}

      {valor.modo === 'Sorteo' && (
        <p className="ayuda">
          El sorteo lo hace la red de Stellar: ningún participante puede elegir el resultado. Es una versión de pruebas:
          un validador de la red podría influir en él.
        </p>
      )}

      {valor.modo !== 'Subasta' && (
        <label className="casilla">
          <input
            type="checkbox"
            checked={valor.intercambio}
            onChange={(e) => alCambiar({ ...valor, intercambio: e.target.checked })}
          />
          <span>
            Permitir intercambiar turnos
            <span className="ayuda"> (dos personas que aún no cobran pueden cambiar sus turnos, con una compensación si se ponen de acuerdo)</span>
          </span>
        </label>
      )}

      {error && <p className="ayuda error">{error}</p>}

      {params && !error && valor.modo !== 'Llegada' && <TablaTurnos params={params} valor={valor} />}
    </fieldset>
  )
}

function TablaTurnos({ params, valor }: { params: ParametrosTanda; valor: OpcionesForm }) {
  const filas = vistaPrevia(params, valor)
  const conPrima = valor.modo === 'PrecioPorTurno'
  const conApartado = filas.some((f) => f.apartado > 0n)
  return (
    <div className="turnos-previa">
      <h3>Cada turno, si todos pagan</h3>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Turno</th>
              <th scope="col" className="num">
                Deja al unirse
              </th>
              {conApartado && (
                <th scope="col" className="num">
                  Se aparta al cobrar
                </th>
              )}
              {conPrima && (
                <th scope="col" className="num">
                  Paga o gana
                </th>
              )}
              <th scope="col" className="num">
                Recibe ({SIMBOLO})
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.turno}>
                <td className="turno">{f.turno + 1}</td>
                <td className="num">{monto(f.alUnirse)}</td>
                {conApartado && <td className="num">{f.apartado > 0n ? monto(f.apartado) : '—'}</td>}
                {conPrima && (
                  <td className="num">{f.prima > 0n ? `paga ${monto(f.prima)}` : f.prima < 0n ? `gana ${monto(-f.prima)}` : '—'}</td>
                )}
                <td className="num">{monto(f.recibe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="explica">
        {valor.modo === 'Sorteo' || valor.modo === 'Subasta'
          ? 'Como el turno no se conoce al unirse, todos dejan una cuota. A quien cobra se le aparta de su bolsa el resto de su garantía: la recupera al final con rendimiento. Es la misma garantía de siempre, sin pedir todo por adelantado.'
          : valor.modo === 'PrecioPorTurno'
            ? 'La prima se descuenta de la bolsa de quien cobra antes y se suma a la de quien cobra al final. Suman cero: el contrato no se queda con nada.'
            : 'Cada quien elige su turno al unirse y deja la garantía de ese turno.'}
        {valor.modo === 'Subasta' && ' Quien gana una ronda recibe además menos por su descuento, que se reparte entre los demás.'}
      </p>
    </div>
  )
}
