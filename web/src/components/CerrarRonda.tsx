// Cerrar la ronda cuando vence (misión M1, opción C del "cerrador automático"). Cualquiera puede cerrarla,
// pero a quien le toca cobrar se le muestra como lo que es para esa persona: "Tu pozo está listo: cóbralo".
// Así no hace falta que alguien se acuerde de cerrar: quien cobra es quien más ganas tiene de hacerlo.
// Antes de firmar dice también si la bolsa sale incompleta porque a alguien no le alcanza la garantía.
// (M1 v4) Si todos pagaron, se puede cerrar antes de que venza: "Todos pagaron: cerrar ya y pagarle a Carla".
import type { MiembroConDireccion } from '../lib/lectura'
import { faltantesAlCerrar } from '../lib/deudas'
import { cuando } from '../lib/formato'
import { dinero } from '../lib/glosario'
import { nombreDe } from '../lib/nombres'

type Props = {
  miembros: MiembroConDireccion[]
  pagaron: string[]
  cuota: bigint
  /** Quien cobra esta ronda (undefined si todavía no se sabe, por ejemplo en una subasta). */
  beneficiario: MiembroConDireccion | undefined
  yo: string | null
  ocupado: boolean
  /** (v4) La ronda todavía no vence, pero todos pagaron: se cierra antes. */
  antes?: boolean
  /** (v4) Fecha límite de la ronda siguiente (segundos Unix), que no cambia al cerrar antes. */
  siguienteVence?: number
  ahora?: number
  /** Firma `cerrar_ronda` y, al terminar, muestra `textoListo`. */
  cerrar: (textoListo: string) => void
  /** (UX) true si entregar el pozo es lo principal para quien mira (ya pagó o no participa). */
  principal?: boolean
}

/** "Ana", "Ana y Beto", "Ana, Beto y Carla". */
function nombres(direcciones: string[]): string {
  const n = direcciones.map(nombreDe)
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

export function CerrarRonda({
  miembros,
  pagaron,
  cuota,
  beneficiario,
  yo,
  ocupado,
  antes = false,
  siguienteVence,
  ahora,
  cerrar,
  principal = false,
}: Props) {
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
      ? 'Todos pagaron: el pozo sale completo.'
      : faltan.length === 0
        ? 'A quien no pagó, su depósito de seguridad le cubre la cuota, así que el pozo sale completo.'
        : `A ${nombres(faltan.map((f) => f.direccion))} no ${varios ? 'les' : 'le'} alcanza el depósito: el pozo sale con ${dinero(total)} menos, que ${deben} y ${varios ? 'pueden' : 'puede'} pagar después.`

  if (antes) {
    const fechas =
      siguienteVence !== undefined
        ? `Las fechas no cambian: el próximo turno ya se puede pagar y vence ${cuando(siguienteVence, ahora ?? siguienteVence)}.`
        : 'Las fechas no cambian.'
    return (
      <>
        <button
          className={soyYo || principal ? 'boton principal' : 'boton secundario'}
          disabled={ocupado}
          onClick={() =>
            cerrar(
              soyYo
                ? 'Listo: cobraste tu pozo.'
                : nombre
                  ? `Listo: ${nombre} recibió el pozo.`
                  : 'Listo: el turno terminó.',
            )
          }
        >
          {soyYo
            ? 'Todos pagaron: cobra tu pozo ya'
            : nombre
              ? `Todos pagaron: entregarle el pozo a ${nombre}`
              : 'Todos pagaron: pasar al siguiente turno'}
        </button>
        <p className="explica">
          No hace falta esperar a la fecha límite{soyYo ? '' : ': cualquier persona del grupo puede hacerlo'}. {fechas}
        </p>
      </>
    )
  }

  if (soyYo && !retenida) {
    return (
      <>
        <button className="boton principal" disabled={ocupado} onClick={() => cerrar('Listo: cobraste tu pozo.')}>
          Tu pozo está listo: cóbralo
        </button>
        <p className="explica">
          El plazo de este turno ya venció. Al cobrar, empieza el turno siguiente. {cobertura}
        </p>
      </>
    )
  }

  return (
    <>
      <button
        className={principal && !retenida ? 'boton principal' : 'boton secundario'}
        disabled={ocupado}
        onClick={() =>
          cerrar(
            nombre && !retenida
              ? `Listo: ${nombre} recibió el pozo.`
              : 'Listo: el turno terminó.',
          )
        }
      >
        {nombre && !retenida ? `Entregarle el pozo a ${nombre}` : 'Pasar al siguiente turno'}
      </button>
      <p className="explica">
        El turno terminó y cualquier persona del grupo puede hacer este paso.{' '}
        {retenida
          ? soyYo
            ? 'Tu pozo queda guardado hasta que te pongas al día: al pagar lo que debes, lo recuperas.'
            : `El pozo de ${nombre} queda guardado hasta que se ponga al día.`
          : cobertura}
      </p>
    </>
  )
}
