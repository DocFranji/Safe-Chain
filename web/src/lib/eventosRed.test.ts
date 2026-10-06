import { describe, expect, it } from 'vitest'
import { eventosEntre, eventosHaciaAtras, ledgerDelCursor, LIMITE, TRAMO, unir, type Pedido, type PedirEventos } from './eventosRed'

type Ev = { id: string; ledger: number; nombre: string }

/** Cursor como los del RPC: el TOID del final del último ledger revisado (`ledger << 32 | 0xFFFFFFFF`). */
const cursorDe = (ledger: number) => `${((BigInt(ledger) << 32n) | 0xffffffffn).toString().padStart(19, '0')}-4294967295`

/**
 * Un RPC como el de testnet: revisa como máximo TRAMO ledgers por consulta, devuelve hasta LIMITE eventos
 * y un cursor con el último ledger que revisó. `endLedger` es exclusivo.
 */
function rpcFalso(eventos: Ev[], masViejo: number, ultimo: number) {
  const pedidos: Pedido[] = []
  const pedir: PedirEventos<Ev> = async (p) => {
    pedidos.push(p)
    let desde: number
    let fin: number
    if ('cursor' in p) {
      desde = ledgerDelCursor(p.cursor)! + 1
      fin = ultimo + 1
    } else {
      if (p.startLedger < masViejo || p.startLedger > ultimo) throw new Error('startLedger must be within the ledger range')
      desde = p.startLedger
      fin = Math.min(p.endLedger, ultimo + 1)
    }
    fin = Math.min(fin, desde + TRAMO)
    const dentro = eventos.filter((e) => e.ledger >= desde && e.ledger < fin)
    if (dentro.length > LIMITE) {
      const pagina = dentro.slice(0, LIMITE)
      // Se detiene en el último evento devuelto (aquí cada evento está en su propio ledger).
      return { events: pagina, cursor: cursorDe(pagina[pagina.length - 1].ledger) }
    }
    return { events: dentro, cursor: cursorDe(fin - 1) }
  }
  return { pedir, pedidos }
}

const ev = (ledger: number, nombre = 'pago', n = 0): Ev => ({ id: `${String(ledger).padStart(10, '0')}-${n}`, ledger, nombre })
const esCreacion = (e: Ev) => e.nombre === 'creada'

describe('ledgerDelCursor', () => {
  it('lee el ledger del TOID', () => {
    expect(ledgerDelCursor('0021646390358704127-4294967295')).toBe(5039942) // consulta desde 5 029 943: revisó 10 000 ledgers
    expect(ledgerDelCursor(cursorDe(1234))).toBe(1234)
    expect(ledgerDelCursor('x')).toBeNull()
  })
})

describe('eventosHaciaAtras', () => {
  // El error que se vio en la vista previa: la tanda es de hoy, pero la red guarda 7 días (120 960 ledgers).
  const masViejo = 4_925_986
  const ultimo = 5_046_945
  const tanda = [ev(5_046_838, 'creada'), ev(5_046_841, 'unido'), ev(5_046_872, 'cubierto'), ev(5_046_909, 'finalizada')]

  it('una sola consulta desde el ledger más viejo no encuentra nada (lo que hacía la web)', async () => {
    const { pedir } = rpcFalso(tanda, masViejo, ultimo)
    const r = await pedir({ startLedger: masViejo, endLedger: ultimo + 1 })
    expect(r.events).toEqual([])
  })

  it('una tanda reciente se lee con una sola consulta', async () => {
    const { pedir, pedidos } = rpcFalso(tanda, masViejo, ultimo)
    const r = await eventosHaciaAtras(pedir, masViejo, ultimo, esCreacion)
    expect(r.map((e) => e.nombre)).toEqual(['creada', 'unido', 'cubierto', 'finalizada'])
    expect(pedidos).toHaveLength(1)
  })

  it('una tanda de hace 5 días se lee completa, tramo por tramo, y se detiene en su creación', async () => {
    const vieja = [ev(4_960_000, 'creada'), ev(4_975_000, 'pago'), ev(5_000_000, 'pago'), ev(5_040_000, 'finalizada')]
    const { pedir, pedidos } = rpcFalso([ev(4_930_000, 'otra'), ...vieja], masViejo, ultimo)
    const r = await eventosHaciaAtras(pedir, masViejo, ultimo, esCreacion)
    expect(r.map((e) => e.nombre)).toEqual(['creada', 'pago', 'pago', 'finalizada'])
    expect(pedidos.length).toBeLessThan(Math.ceil((ultimo - masViejo) / TRAMO))
  })

  it('si la creación ya no está en la red, devuelve lo que queda sin repetir', async () => {
    const { pedir } = rpcFalso([ev(4_926_000, 'pago'), ev(5_046_000, 'pago')], masViejo, ultimo)
    const r = await eventosHaciaAtras(pedir, masViejo, ultimo, esCreacion)
    expect(r.map((e) => e.ledger)).toEqual([4_926_000, 5_046_000])
  })
})

describe('eventosEntre', () => {
  it('sigue el cursor cuando un tramo tiene más eventos que una página', async () => {
    const muchos = Array.from({ length: LIMITE * 2 + 17 }, (_, i) => ev(1_000 + i))
    const { pedir, pedidos } = rpcFalso(muchos, 1, 5_000)
    const r = await eventosEntre(pedir, 1, 5_000)
    expect(r).toHaveLength(muchos.length)
    expect(pedidos.length).toBe(3)
  })

  it('no pide nada si no hay ledgers nuevos', async () => {
    const { pedir, pedidos } = rpcFalso([], 1, 5_000)
    expect(await eventosEntre(pedir, 5_001, 5_000)).toEqual([])
    expect(pedidos).toHaveLength(0)
  })
})

describe('unir', () => {
  it('no repite eventos y los deja en orden', () => {
    expect(unir([ev(1), ev(3)], [ev(3), ev(2)]).map((e) => e.ledger)).toEqual([1, 2, 3])
  })
})
