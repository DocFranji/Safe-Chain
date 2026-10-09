// Opciones de historial al crear una tanda (misión M2): pedir un nivel mínimo para entrar y dar
// descuento de garantía por buen historial. Se aplican con una firma extra (`configurar_requisitos`)
// justo después de crear la tanda, antes de que entre nadie. Si no hay historial, no se muestra.
import { useDireccionHistorial, useHistorialCacheado } from '../hooks/useHistorial'
import { NIVELES, hayRequisitos, nivelDePuntaje, puntajeDe, type OpcionesDeHistorial } from '../lib/historial'
import { RUTA_PERFIL } from '../lib/rutas'
import './historial.css'

type Props = {
  valor: OpcionesDeHistorial
  alCambiar: (v: OpcionesDeHistorial) => void
  /** Quien crea, si también se une: para avisarle si no alcanza el nivel que pide. */
  yo: string | null
  unirmeYo: boolean
}

export function OpcionesHistorial({ valor, alCambiar, yo, unirmeYo }: Props) {
  const contrato = useDireccionHistorial()
  if (!contrato) return null
  return <Opciones valor={valor} alCambiar={alCambiar} yo={yo} unirmeYo={unirmeYo} />
}

function Opciones({ valor, alCambiar, yo, unirmeYo }: Props) {
  const mio = useHistorialCacheado(yo ?? '')
  const miPuntaje = yo && mio ? puntajeDe(mio) : 0
  const noAlcanzo = unirmeYo && valor.puntaje_minimo > 0 && miPuntaje < valor.puntaje_minimo
  const niveles = NIVELES.filter((n) => n.desde > 0)

  return (
    <fieldset className="campo opciones-historial">
      <legend>Historial crediticio (opcional)</legend>

      <label className="casilla">
        <input
          type="checkbox"
          checked={valor.descuento}
          onChange={(e) => alCambiar({ ...valor, descuento: e.target.checked })}
        />
        <span>
          Dar descuento de depósito por buen historial
          <span className="ayuda">
            {' '}
            (Bronce 10 %, Plata 25 %, Oro 50 % menos; nunca menos de una cuota). Quien cumple deja menos dinero
            inmovilizado, y el grupo asume un poco más de riesgo.
          </span>
        </span>
      </label>

      <label className="casilla">
        <input
          type="checkbox"
          checked={valor.puntaje_minimo > 0}
          onChange={(e) => alCambiar({ ...valor, puntaje_minimo: e.target.checked ? niveles[0].desde : 0 })}
        />
        <span>Pedir un nivel mínimo para unirse</span>
      </label>
      {valor.puntaje_minimo > 0 && (
        <div className="fila-campo">
          <label htmlFor="nivel-minimo">Nivel mínimo</label>
          <select
            id="nivel-minimo"
            value={valor.puntaje_minimo}
            onChange={(e) => alCambiar({ ...valor, puntaje_minimo: Number(e.target.value) })}
          >
            {niveles.map((n) => (
              <option key={n.nombre} value={n.desde}>
                {n.nombre} ({n.desde} puntos o más)
              </option>
            ))}
          </select>
        </div>
      )}
      {valor.puntaje_minimo > 0 && (
        <p className="ayuda">Solo podrán entrar personas con historial {nivelDePuntaje(valor.puntaje_minimo)} o mejor.</p>
      )}
      {noAlcanzo && (
        <p className="aviso nota">
          Tu historial tiene {miPuntaje} puntos: con este requisito no podrías unirte. Baja el nivel o desmarca «Unirme
          yo también». <a href={RUTA_PERFIL}>Ver mi historial</a>
        </p>
      )}
      {hayRequisitos(valor) && (
        <p className="ayuda">Necesitarás confirmar una firma más, justo después de crear la tanda.</p>
      )}
    </fieldset>
  )
}
