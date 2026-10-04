// Nota de historial junto al botón de unirse (misión M2): qué pide esta tanda y, si da descuento,
// cuánto baja tu garantía por tu nivel. No dice nada si la tanda no usa el historial.
import { useHistorialCacheado } from '../hooks/useHistorial'
import { nivelDePuntaje, puntajeDe } from '../lib/historial'
import { monto } from '../lib/formato'
import { RUTA_MI_HISTORIAL } from '../lib/rutas'
import { useSimbolo } from '../hooks/useMoneda'

type Props = {
  yo: string | null
  requisitos: { puntaje_minimo: number; descuento: boolean }
  /** Garantía normal del próximo turno y la que dejaría `yo` con descuento. */
  normal: bigint
  conDescuento: bigint | null
}

export function NotaHistorial({ yo, requisitos, normal, conDescuento }: Props) {
  const SIMBOLO = useSimbolo()
  const h = useHistorialCacheado(yo ?? '')
  if (requisitos.puntaje_minimo === 0 && !requisitos.descuento) return null
  const puntaje = yo && h ? puntajeDe(h) : null
  const nivel = puntaje !== null ? nivelDePuntaje(puntaje) : null
  const noAlcanza = puntaje !== null && puntaje < requisitos.puntaje_minimo

  return (
    <div className="nota-historial">
      {requisitos.puntaje_minimo > 0 && (
        <p className={noAlcanza ? 'aviso nota' : 'explica'}>
          Esta tanda pide historial {nivelDePuntaje(requisitos.puntaje_minimo)} o mejor ({requisitos.puntaje_minimo}{' '}
          puntos).
          {puntaje !== null && (noAlcanza ? ` Tienes ${puntaje}: todavía no puedes unirte.` : ` Tienes ${puntaje}: puedes entrar.`)}{' '}
          <a href={RUTA_MI_HISTORIAL}>Ver mi historial</a>
        </p>
      )}
      {requisitos.descuento &&
        (conDescuento !== null && conDescuento < normal ? (
          <p className="aviso listo">
            Por tu historial {nivel}, tu garantía baja de {monto(normal)} a {monto(conDescuento)} {SIMBOLO}.
          </p>
        ) : (
          <p className="explica">
            Esta tanda da descuento de garantía por buen historial (desde nivel Bronce).
          </p>
        ))}
    </div>
  )
}
