// Nota de historial junto al botón de unirse (misión M2): qué pide esta tanda y, si da descuento,
// cuánto baja tu depósito por tu nivel. No dice nada si la tanda no usa el historial.
import { useHistorialCacheado } from '../hooks/useHistorial'
import { nivelDePuntaje, puntajeDe, tieneMoraPendiente } from '../lib/historial'
import { dinero } from '../lib/glosario'
import { RUTA_PERFIL } from '../lib/rutas'

type Props = {
  yo: string | null
  requisitos: { puntaje_minimo: number; descuento: boolean }
  /** Garantía normal del próximo turno y la que dejaría `yo` con descuento. */
  normal: bigint
  conDescuento: bigint | null
}

export function NotaHistorial({ yo, requisitos, normal, conDescuento }: Props) {
  const h = useHistorialCacheado(yo ?? '')
  // (v4, N2) Con una deuda abierta en cualquier tanda no se puede unir: se avisa antes de firmar.
  if (yo && h && tieneMoraPendiente(h)) {
    return (
      <div className="nota-historial">
        <p className="aviso error">
          Tienes una deuda pendiente en otra tanda: no puedes unirte hasta pagarla.{' '}
          <a href={RUTA_PERFIL}>Ver y pagar mis deudas</a>
        </p>
      </div>
    )
  }
  if (requisitos.puntaje_minimo === 0 && !requisitos.descuento) return null
  const puntaje = yo && h ? puntajeDe(h) : null
  const nivel = puntaje !== null ? nivelDePuntaje(puntaje) : null
  const noAlcanza = puntaje !== null && puntaje < requisitos.puntaje_minimo

  return (
    <div className="nota-historial">
      {requisitos.puntaje_minimo > 0 && (
        <p className={noAlcanza ? 'aviso nota' : 'explica'}>
          Esta tanda pide una reputación {nivelDePuntaje(requisitos.puntaje_minimo)} o mejor ({requisitos.puntaje_minimo}{' '}
          puntos).
          {puntaje !== null && (noAlcanza ? ` Tienes ${puntaje}: todavía no puedes unirte.` : ` Tienes ${puntaje}: puedes entrar.`)}{' '}
          <a href={RUTA_PERFIL}>Ver mi reputación</a>
        </p>
      )}
      {requisitos.descuento &&
        (conDescuento !== null && conDescuento < normal ? (
          <p className="aviso listo">
            Por tu reputación {nivel}, tu depósito baja de {dinero(normal)} a {dinero(conDescuento)}.
          </p>
        ) : (
          <p className="explica">
            Esta tanda da descuento en el depósito por buena reputación (desde nivel Bronce).
          </p>
        ))}
    </div>
  )
}
