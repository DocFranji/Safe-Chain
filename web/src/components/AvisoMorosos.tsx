// El aviso rojo de la tanda abierta (pedido 4 del plan v5): si alguien del grupo tiene un pago pendiente en otra
// tanda, se dice arriba de todo y no se puede cerrar. A quien tiene el pago pendiente se le habla aparte, con el
// enlace a sus deudas. Las frases están en lib/morosos.ts; quién tiene el pago pendiente, en hooks/useMora.ts.
import type { MiembroConDireccion } from '../hooks/useTanda'
import { usePagosPendientes } from '../hooks/useMora'
import { avisosDePagoPendiente } from '../lib/morosos'
import { nombreDe } from '../lib/nombres'
import { RUTA_PERFIL } from '../lib/rutas'
import './mora.css'

type Props = { miembros: MiembroConDireccion[]; yo: string | null }

export function AvisoMorosos({ miembros, yo }: Props) {
  const conMora = usePagosPendientes()
  const otros = miembros.filter((m) => m.direccion !== yo && conMora.has(m.direccion)).map((m) => nombreDe(m.direccion))
  const yoTengo = yo !== null && conMora.has(yo) && miembros.some((m) => m.direccion === yo)
  const avisos = avisosDePagoPendiente(otros, yoTengo)
  if (avisos.length === 0) return null

  return (
    <section className="aviso-mora" role="alert">
      <span className="aviso-mora-icono" aria-hidden="true">
        !
      </span>
      <div className="aviso-mora-cuerpo">
        {avisos.map((a) => (
          <div key={a.titulo}>
            <p className="aviso-mora-titulo">{a.titulo}</p>
            <p>{a.detalle}</p>
          </div>
        ))}
        {yoTengo && <a href={RUTA_PERFIL}>Ver y pagar mis deudas</a>}
      </div>
    </section>
  )
}
