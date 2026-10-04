// Cerrar la ronda cuando vence (misión M1, opción C del "cerrador automático"). Cualquiera puede cerrarla,
// pero a quien le toca cobrar se le muestra como lo que es para esa persona: "Tu bolsa está lista: cóbrala".
// Así no hace falta que alguien se acuerde de cerrar: quien cobra es quien más ganas tiene de hacerlo.
// Antes de firmar dice también si la bolsa sale incompleta porque a alguien no le alcanza la garantía.
import type { MiembroConDireccion } from '../lib/lectura'
import { faltantesAlCerrar } from '../lib/deudas'
import { monto } from '../lib/formato'
import { nombreDe } from '../lib/nombres'
import { useSimbolo } from '../hooks/useMoneda'

type Props = {
  miembros: MiembroConDireccion[]
  pagaron: string[]
  cuota: bigint
  /** Quien cobra esta ronda (undefined si todavía no se sabe, por ejemplo en una subasta). */
  beneficiario: MiembroConDireccion | undefined
  yo: string | null
  ocupado: boolean
  /** Firma `cerrar_ronda` y, al terminar, muestra `textoListo`. */
  cerrar: (textoListo: string) => void
}

/** "Ana", "Ana y Beto", "Ana, Beto y Carla". */
function nombres(direcciones: string[]): string {
  const n = direcciones.map(nombreDe)
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

export function CerrarRonda({ miembros, pagaron, cuota, beneficiario, yo, ocupado, cerrar }: Props) {
  const SIMBOLO = useSimbolo()
  const soyYo = beneficiario !== undefined && beneficiario.direccion === yo
  const nombre = beneficiario ? nombreDe(beneficiario.direccion) : null
  const retenida = beneficiario?.moroso === true

  const faltan = faltantesAlCerrar(miembros, pagaron, cuota)
  const total = faltan.reduce((s, f) => s + f.falta, 0n)
  const varios = faltan.length > 1
  const quedan = varios ? 'quedan' : 'queda'
  const deben = soyYo ? `te ${quedan} debiendo` : `le ${quedan} debiendo a ${nombre ?? 'quien cobra'}`
  const cobertura =
    pagaron.length >= miembros.length
      ? 'Todos pagaron: la bolsa sale completa.'
      : faltan.length === 0
        ? 'A quien no pagó, su garantía le cubre la cuota, así que la bolsa sale completa.'
        : `A ${nombres(faltan.map((f) => f.direccion))} no ${varios ? 'les' : 'le'} alcanza la garantía: la bolsa sale con ${monto(total)} ${SIMBOLO} menos, que ${deben} y ${varios ? 'pueden' : 'puede'} pagar después.`

  if (soyYo && !retenida) {
    return (
      <>
        <button className="boton principal" disabled={ocupado} onClick={() => cerrar('Listo: cobraste tu bolsa.')}>
          Tu bolsa está lista: cóbrala
        </button>
        <p className="explica">
          El plazo de esta ronda ya venció. Al cobrarla se cierra la ronda y empieza la siguiente. {cobertura}
        </p>
      </>
    )
  }

  return (
    <>
      <button
        className="boton secundario"
        disabled={ocupado}
        onClick={() =>
          cerrar(
            nombre && !retenida
              ? `Listo: la ronda se cerró y ${nombre} recibió la bolsa.`
              : 'Listo: la ronda se cerró.',
          )
        }
      >
        {nombre && !retenida ? `Cerrar la ronda y pagarle a ${nombre}` : 'Cerrar la ronda'}
      </button>
      <p className="explica">
        Cualquier persona puede cerrar la ronda.{' '}
        {retenida
          ? soyYo
            ? 'Tu bolsa queda retenida hasta que saldes tu deuda: al pagarla, la recuperas.'
            : `La bolsa de ${nombre} queda retenida hasta que salde su deuda.`
          : cobertura}
      </p>
    </>
  )
}
