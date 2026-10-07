// ¿A quien está conectado le toca cobrar ya? (misión M1, opción C del "cerrador automático").
// Cuando la ronda vence, quien cobra la cierra al cobrar su bolsa: la web se lo muestra en el lobby y en
// la página de la tanda. Pura: se prueba sin red.

type Tanda = { estado: { tag: string }; ronda_actual: number; inicio_ronda: bigint; periodo_seg: bigint }
type TandaConTamano = Tanda & { n_miembros: number }
type Miembro = { direccion: string; posicion: number; moroso: boolean }

/** true si la ronda ya venció, le toca cobrar a `yo` y su bolsa no queda retenida por deuda. */
export function bolsaListaParaCobrar(tanda: Tanda, miembros: Miembro[], yo: string | null, ahora: number): boolean {
  if (yo === null || tanda.estado.tag !== 'Activa') return false
  if (ahora < Number(tanda.inicio_ronda + tanda.periodo_seg)) return false
  const beneficiario = miembros.find((m) => m.posicion === tanda.ronda_actual)
  return beneficiario !== undefined && beneficiario.direccion === yo && !beneficiario.moroso
}

/** Tope del cierre anticipado: la fecha límite siguiente no puede quedar a más de 120 días (`tiempos.rs`). */
export const HORIZONTE_CIERRE_ANTES_SEG = 120 * 86_400

/**
 * ¿Se puede cerrar la ronda antes de que venza? (misión M1 v4, igual que `revisar_cierre_anticipado` en el
 * contrato). Solo si todos pagaron, nunca en la subasta y sin dejar la fecha límite siguiente a más de 120 días.
 * Las fechas no cambian: la ronda siguiente vence un periodo después de la fecha límite de esta.
 */
export function puedeCerrarAntes(tanda: TandaConTamano, pagaron: number, modo: string, ahora: number): boolean {
  if (tanda.estado.tag !== 'Activa' || modo === 'Subasta') return false
  if (ahora >= Number(tanda.inicio_ronda + tanda.periodo_seg)) return false
  if (pagaron < tanda.n_miembros) return false
  return Number(tanda.inicio_ronda + 2n * tanda.periodo_seg) <= ahora + HORIZONTE_CIERRE_ANTES_SEG
}
