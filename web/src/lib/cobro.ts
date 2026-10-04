// ¿A quien está conectado le toca cobrar ya? (misión M1, opción C del "cerrador automático").
// Cuando la ronda vence, quien cobra la cierra al cobrar su bolsa: la web se lo muestra en el lobby y en
// la página de la tanda. Pura: se prueba sin red.

type Tanda = { estado: { tag: string }; ronda_actual: number; inicio_ronda: bigint; periodo_seg: bigint }
type Miembro = { direccion: string; posicion: number; moroso: boolean }

/** true si la ronda ya venció, le toca cobrar a `yo` y su bolsa no queda retenida por deuda. */
export function bolsaListaParaCobrar(tanda: Tanda, miembros: Miembro[], yo: string | null, ahora: number): boolean {
  if (yo === null || tanda.estado.tag !== 'Activa') return false
  if (ahora < Number(tanda.inicio_ronda + tanda.periodo_seg)) return false
  const beneficiario = miembros.find((m) => m.posicion === tanda.ronda_actual)
  return beneficiario !== undefined && beneficiario.direccion === yo && !beneficiario.moroso
}
