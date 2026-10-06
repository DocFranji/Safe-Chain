// Leer los eventos de una tanda desde la red, por tramos.
//
// El RPC de Stellar revisa como máximo TRAMO ledgers en cada consulta de `getEvents` (en testnet, 10 000:
// unas 14 horas) y devuelve un cursor con el último ledger que revisó. Si se pregunta desde el ledger más
// viejo que guarda (hace ~7 días), solo revisa el primer tramo y casi siempre vuelve vacío. Por eso:
// - la primera lectura de una tanda va hacia atrás, tramo por tramo, desde el ledger más reciente hasta
//   encontrar el evento `creada` de esa tanda (o hasta el ledger más viejo que guarda la red);
// - las siguientes solo piden lo nuevo, desde el último ledger leído.
// Esta lógica no depende de la red: recibe la función que consulta, así se puede probar sola.

/** Ledgers que el RPC revisa como máximo en cada consulta de eventos. */
export const TRAMO = 10_000
/** Eventos por página (el RPC permite hasta 10 000; 200 alcanza para una tanda de 12 en un tramo). */
export const LIMITE = 200
/** Tope de consultas seguidas al seguir un cursor, por si el RPC respondiera algo raro. */
const MAX_PAGINAS = 50

export type EventoCrudo = { id: string; ledger: number }
export type Pagina<E> = { events: E[]; cursor: string }
export type Pedido = { startLedger: number; endLedger: number } | { cursor: string }
export type PedirEventos<E> = (p: Pedido) => Promise<Pagina<E>>

/** El último ledger que revisó una consulta. El cursor es un TOID (`ledger << 32 | …`), más un sufijo. */
export function ledgerDelCursor(cursor: string): number | null {
  const m = /^(\d+)/.exec(cursor)
  if (!m) return null
  return Number(BigInt(m[1]) >> 32n)
}

/** Todos los eventos entre los ledgers `desde` y `hasta` (incluidos), siguiendo el cursor. */
export async function eventosEntre<E extends EventoCrudo>(pedir: PedirEventos<E>, desde: number, hasta: number): Promise<E[]> {
  const salida: E[] = []
  if (desde > hasta) return salida
  let r = await pedir({ startLedger: desde, endLedger: hasta + 1 })
  let anterior: string | null = null
  for (let pagina = 1; ; pagina++) {
    salida.push(...r.events.filter((e) => e.ledger >= desde && e.ledger <= hasta))
    const llego = ledgerDelCursor(r.cursor)
    const llena = r.events.length >= LIMITE
    const pasoDelFinal = r.events.some((e) => e.ledger > hasta)
    if (llego === null || pasoDelFinal || (!llena && llego >= hasta)) break
    if (r.cursor === anterior || pagina >= MAX_PAGINAS) break
    anterior = r.cursor
    r = await pedir({ cursor: r.cursor })
  }
  return salida
}

/**
 * Primera lectura: de `ultimo` hacia atrás, por tramos, hasta que un tramo traiga la creación de la tanda
 * (`esCreacion`) o hasta `masViejo`. Devuelve los eventos en orden cronológico.
 */
export async function eventosHaciaAtras<E extends EventoCrudo>(
  pedir: PedirEventos<E>,
  masViejo: number,
  ultimo: number,
  esCreacion: (e: E) => boolean,
): Promise<E[]> {
  let salida: E[] = []
  for (let fin = ultimo; fin >= masViejo; ) {
    const inicio = Math.max(masViejo, fin - TRAMO + 1)
    const tramo = await eventosEntre(pedir, inicio, fin)
    salida = [...tramo, ...salida]
    if (tramo.some(esCreacion)) break
    fin = inicio - 1
  }
  return salida
}

/** Une dos listas de eventos sin repetir ninguno (por id) y en orden. */
export function unir<E extends EventoCrudo>(a: E[], b: E[]): E[] {
  const vistos = new Set(a.map((e) => e.id))
  return [...a, ...b.filter((e) => !vistos.has(e.id))].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}
