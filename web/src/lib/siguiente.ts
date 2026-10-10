// La "siguiente acción" de la página de una tanda: un mensaje claro según el caso de quien mira
// ("Te toca pagar $20", "Esperando a 2 personas", "Te toca cobrar", "Debes $100"...).
// El botón lo pone el panel (PanelRonda); aquí solo se decide qué decir. Lógica pura: siguiente.test.ts.
import { cuando, duracion } from './formato'
import { dinero } from './glosario'

export type Tono = 'entrar' | 'invitar' | 'esperar' | 'pagar' | 'tarde' | 'cobrar' | 'entregar' | 'deuda' | 'repartir' | 'fin' | 'cancelada'

export type Siguiente = { tono: Tono; titulo: string; detalle?: string }

export type Situacion = {
  estado: string
  /** null: nadie conectado. */
  yo: string | null
  n: number
  unidos: number
  cuota: bigint
  multa: bigint
  /** Turno en curso (0, 1, ...). */
  turno: number
  pagaron: number
  /** Quien está conectado, si está en la tanda. */
  mio: { posicion: number; cobro: boolean; moroso: boolean; deuda: bigint } | null
  yaPague: boolean
  /** Nombre de quien cobra este turno (null si todavía no se sabe, como en una subasta). */
  cobra: string | null
  soyQuienCobra: boolean
  /** El pozo de quien cobra queda guardado porque tiene un pago pendiente. */
  cobraGuardado: boolean
  /** El pozo ya se puede entregar (venció el plazo o todos pagaron). */
  entregable: boolean
  vence: number
  ahora: number
}

/** "Vence en 1 min 12 s" (si falta menos de una hora) o "Vence el martes 3 de noviembre". */
export function textoVence(vence: number, ahora: number): string {
  const falta = vence - ahora
  if (falta <= 0) return `El plazo venció hace ${duracion(-falta)}.`
  return falta < 3_600 ? `Vence en ${duracion(falta)}.` : `Vence ${cuando(vence, ahora)}.`
}

const personas = (k: number) => (k === 1 ? '1 persona' : `${k} personas`)

export function siguienteAccion(s: Situacion): Siguiente {
  const pozo = s.cuota * BigInt(s.n)
  switch (s.estado) {
    case 'Abierta': {
      const faltan = s.n - s.unidos
      if (!s.mio) return { tono: 'entrar', titulo: 'Únete a esta tanda' }
      return {
        tono: 'invitar',
        titulo: faltan === 1 ? 'Esperando a 1 persona más' : `Esperando a ${faltan} personas más`,
        detalle: 'La tanda empieza sola cuando se complete el grupo. Mientras tanto, invita a quien falte.',
      }
    }
    case 'Activa': {
      if (!s.yo) return { tono: 'entrar', titulo: `Turno ${s.turno + 1} de ${s.n}`, detalle: 'Entra para ver qué te toca.' }
      if (!s.mio) {
        if (s.entregable && s.cobra && !s.cobraGuardado)
          return { tono: 'entregar', titulo: `El turno terminó: falta entregarle el pozo a ${s.cobra}`, detalle: 'Cualquier persona puede hacerlo.' }
        return { tono: 'esperar', titulo: `Turno ${s.turno + 1} de ${s.n}`, detalle: 'No participas en esta tanda.' }
      }
      if (s.mio.moroso)
        return {
          tono: 'deuda',
          titulo: `Debes ${dinero(s.mio.deuda)}`,
          detalle: 'Tu depósito ya no alcanzó a cubrir tus cuotas. Paga lo que falta para ponerte al día.',
        }
      const vencida = s.vence <= s.ahora
      if (!s.yaPague) {
        if (vencida)
          return {
            tono: 'tarde',
            titulo: `Vas tarde: paga tu cuota de ${dinero(s.cuota)}`,
            detalle: `${textoVence(s.vence, s.ahora)}${s.multa > 0n ? ` Pagar tarde cuesta ${dinero(s.multa)} de multa.` : ''} Si no pagas, tu depósito cubre la cuota.`,
          }
        return { tono: 'pagar', titulo: `Te toca pagar ${dinero(s.cuota)}`, detalle: textoVence(s.vence, s.ahora) }
      }
      // Ya pagué este turno.
      if (s.entregable) {
        if (s.soyQuienCobra && !s.cobraGuardado) return { tono: 'cobrar', titulo: `Te toca cobrar ${dinero(pozo)}`, detalle: 'Tu pozo está listo.' }
        if (s.cobra && !s.cobraGuardado)
          return { tono: 'entregar', titulo: `El turno terminó: falta entregarle el pozo a ${s.cobra}`, detalle: 'Cualquier persona del grupo puede hacerlo.' }
      }
      const faltan = s.n - s.pagaron
      // Si cobro yo, ya lo dice la línea de "mi turno" del panel.
      const quien = !s.soyQuienCobra && s.cobra ? `En este turno cobra ${s.cobra}.` : ''
      return {
        tono: 'esperar',
        titulo: faltan > 0 ? `Ya pagaste. Esperando a ${personas(faltan)}` : 'Ya pagaste. Todos pagaron',
        detalle: [quien, textoVence(s.vence, s.ahora)].filter(Boolean).join(' '),
      }
    }
    case 'PorLiquidar':
      return {
        tono: 'repartir',
        titulo: 'Todos los turnos terminaron: falta repartir lo que queda',
        detalle: 'Se devuelve a cada quien su depósito con intereses. Cualquier persona puede hacerlo.',
      }
    case 'Finalizada':
      return { tono: 'fin', titulo: 'Terminó la tanda' }
    default:
      return { tono: 'cancelada', titulo: 'Esta tanda se canceló', detalle: 'Cada quien recuperó su depósito.' }
  }
}
