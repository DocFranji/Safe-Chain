// Lecturas "a mano" contra la red que el cliente generado de la tanda no cubre:
// saldo de TUSD, valor de la bóveda (rendimiento) y eventos de una tanda (resultados finales).
// Todas son de solo lectura: no piden firma ni cuestan nada.
import {
  Account,
  Address,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import { clienteLectura } from './contrato'
import { ordenar, type EventoTanda } from './historia'
import { eventosEntre, eventosHaciaAtras, LIMITE, unir, type PedirEventos } from './eventosRed'
import { NETWORK_PASSPHRASE, RPC_URL, TANDA_ID, TOKEN_ID } from '../config'

/** Cuenta "vacía" que sirve para simular llamadas de solo lectura sin ninguna billetera. */
const CUENTA_NULA = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

let servidorUnico: rpc.Server | null = null
export function servidor(): rpc.Server {
  servidorUnico ??= new rpc.Server(RPC_URL)
  return servidorUnico
}

/** Llama a una función de solo lectura de cualquier contrato y devuelve el valor ya convertido. */
export async function simular(contrato: string, metodo: string, args: xdr.ScVal[] = []): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(CUENTA_NULA, '0'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contrato).call(metodo, ...args))
    .setTimeout(30)
    .build()
  const sim = await servidor().simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const retval = sim.result?.retval
  if (!retval) throw new Error('La red no devolvió ningún valor.')
  return scValToNative(retval)
}

// ---------------------------------------------------------------------------
// Token (TUSD)
// ---------------------------------------------------------------------------

/** Saldo de TUSD de una cuenta, en unidades de 7 decimales. Es 0 si todavía no acepta TUSD. */
export async function saldoToken(direccion: string): Promise<bigint> {
  const v = await simular(TOKEN_ID, 'balance', [new Address(direccion).toScVal()])
  return BigInt(v as bigint | number | string)
}

let emisorEnCache: Promise<{ codigo: string; emisor: string }> | null = null

/**
 * Código y emisor del activo (por ejemplo TUSD y la cuenta G... que lo emite).
 * El contrato del token (Stellar Asset Contract) responde a `name()` con "TUSD:G...".
 */
export function activoToken(): Promise<{ codigo: string; emisor: string }> {
  emisorEnCache ??= simular(TOKEN_ID, 'name').then((n) => {
    const [codigo, emisor] = String(n).split(':')
    if (!codigo || !emisor) throw new Error('No pudimos leer el activo del token.')
    return { codigo, emisor }
  })
  emisorEnCache.catch(() => {
    emisorEnCache = null // si falló, la próxima vez se vuelve a intentar
  })
  return emisorEnCache
}

// ---------------------------------------------------------------------------
// Bóveda (rendimiento)
// ---------------------------------------------------------------------------

let bovedaEnCache: Promise<string> | null = null

/**
 * La dirección de la bóveda solo está guardada dentro del contrato de la tanda
 * (DataKey::Boveda). La leemos de su almacenamiento para no depender de otra variable.
 */
export function direccionBoveda(): Promise<string> {
  bovedaEnCache ??= (async () => {
    const entrada = await servidor().getContractData(
      TANDA_ID,
      xdr.ScVal.scvLedgerKeyContractInstance(),
      rpc.Durability.Persistent,
    )
    // En el SDK 17 el XDR se recorre con propiedades: dato del contrato -> valor -> instancia -> almacenamiento.
    const dato = entrada.val
    const valor = dato.type === 'contractData' ? dato.contractData.val : null
    const almacen = valor?.type === 'scvContractInstance' ? (valor.instance.storage ?? []) : []
    for (const e of almacen) {
      const clave = scValToNative(e.key) as unknown
      if (Array.isArray(clave) && clave[0] === 'Boveda') return String(scValToNative(e.val))
    }
    throw new Error('No encontramos la bóveda en el contrato.')
  })()
  bovedaEnCache.catch(() => {
    bovedaEnCache = null
  })
  return bovedaEnCache
}

/** Cuántos TUSD valen hoy `shares` participaciones de la bóveda (la de la tanda, o la principal). */
export async function valorBoveda(shares: bigint, boveda?: string | null): Promise<bigint> {
  const direccion = boveda ?? (await direccionBoveda())
  const v = await simular(direccion, 'valor', [nativeToScVal(shares, { type: 'i128' })])
  return BigInt(v as bigint | number | string)
}

const aceleradores = new Map<string, Promise<number>>()

/**
 * Cuántas veces más rápido corre el tiempo para los intereses en esa bóveda (1 = como en la vida real).
 * Una bóveda que no lo sabe decir (por ejemplo, un adaptador a un protocolo real) cuenta como 1.
 */
export function aceleradorBoveda(boveda: string): Promise<number> {
  let a = aceleradores.get(boveda)
  if (!a) {
    a = simular(boveda, 'acelerador')
      .then((v) => Number(v))
      .catch(() => 1)
    aceleradores.set(boveda, a)
  }
  return a
}

// ---------------------------------------------------------------------------
// Eventos del contrato (historia de la tanda y resultados finales)
// ---------------------------------------------------------------------------

// La red solo guarda los eventos un tiempo (en testnet, ~7 días) y esa ventana avanza un ledger cada ~5 s.
// `getEvents` rechaza un `startLedger` fuera de ella (incluso el que `getHealth` dice que es el más viejo),
// así que dejamos un margen: perder los primeros minutos de una ventana de 7 días no cambia nada.
const MARGEN_VENTANA = 60

type Crudo = rpc.Api.EventResponse
/** Lo ya leído de cada tanda: sus eventos y hasta qué ledger se revisó. Así cada refresco pide solo lo nuevo. */
const leidos = new Map<number, { eventos: Crudo[]; hasta: number }>()
/** Una sola lectura a la vez por tanda (la primera puede tardar varios segundos). */
const enCurso = new Map<number, Promise<Crudo[]>>()

function esCreacion(e: Crudo): boolean {
  try {
    return scValToNative(e.topic[0]) === 'creada'
  } catch {
    return false
  }
}

async function crudosDeTanda(id: number): Promise<Crudo[]> {
  const s = servidor()
  const filtro = {
    type: 'contract' as const,
    contractIds: [TANDA_ID],
    topics: [['*', nativeToScVal(id, { type: 'u32' }).toXDR('base64')]],
  }
  const pedir: PedirEventos<Crudo> = async (p) => {
    const r = await s.getEvents({ ...p, filters: [filtro], limit: LIMITE })
    return { events: r.events, cursor: r.cursor }
  }
  // `getHealth` da en una sola consulta el ledger más reciente y el más viejo que guarda la red.
  const salud = await s.getHealth()
  const ultimo = salud.latestLedger
  const previo = leidos.get(id)
  let eventos: Crudo[]
  if (previo) {
    eventos = unir(previo.eventos, await eventosEntre(pedir, previo.hasta + 1, ultimo))
  } else {
    eventos = await eventosHaciaAtras(pedir, salud.oldestLedger + MARGEN_VENTANA, ultimo, esCreacion)
  }
  leidos.set(id, { eventos, hasta: Math.max(ultimo, previo?.hasta ?? 0) })
  return eventos
}

/**
 * Todos los eventos de UNA tanda, del más viejo al más nuevo. El contrato publica cada evento con
 * dos "topics": su nombre y el número de la tanda; el comodín "*" acepta cualquier nombre.
 * La red conserva los eventos solo unos días: una tanda muy vieja puede devolver una lista vacía.
 */
export async function leerEventos(id: number): Promise<EventoTanda[]> {
  let lectura = enCurso.get(id)
  if (!lectura) {
    lectura = crudosDeTanda(id).finally(() => enCurso.delete(id))
    enCurso.set(id, lectura)
  }
  const crudos = await lectura

  const cliente = clienteLectura()
  const salida: EventoTanda[] = []
  for (const ev of crudos) {
    if (!ev.inSuccessfulContractCall) continue
    // Un evento que no se pueda interpretar no debe tumbar toda la historia: se omite y se sigue.
    let evento
    try {
      evento = cliente.parseEvent(ev.topic, ev.value)
    } catch (e) {
      console.warn('Evento ilegible, se omite', ev.id, e)
      continue
    }
    if (!evento) continue
    salida.push({ id: ev.id, ledger: ev.ledger, cerradoEn: ev.ledgerClosedAt, evento })
  }
  return ordenar(salida)
}

export type PagoFinal = { miembro: string; monto: bigint }

export type ResultadosTanda = {
  pagos: PagoFinal[]
  rendimiento: bigint | null
  fondoPremios: bigint | null
  retenido: bigint | null
}

/**
 * El contrato no guarda cuánto recibió cada persona al final: solo lo anuncia con eventos
 * (`liquidado` y `finalizada`). Si la red ya no los conserva, devolvemos null y la pantalla lo explica.
 */
export function resultadosDesdeEventos(eventos: EventoTanda[]): ResultadosTanda | null {
  const pagos: PagoFinal[] = []
  let final: Pick<ResultadosTanda, 'rendimiento' | 'fondoPremios' | 'retenido'> | null = null
  for (const { evento: e } of eventos) {
    if (e.name === 'EvLiquidado' && e.data.miembro !== undefined && e.data.monto !== undefined) {
      pagos.push({ miembro: e.data.miembro, monto: e.data.monto })
    } else if (e.name === 'EvFinalizada') {
      final = {
        rendimiento: e.data.rendimiento ?? null,
        fondoPremios: e.data.fondo_premios ?? null,
        retenido: e.data.retenido ?? null,
      }
    }
  }
  if (pagos.length === 0 && final === null) return null
  return { pagos, rendimiento: final?.rendimiento ?? null, fondoPremios: final?.fondoPremios ?? null, retenido: final?.retenido ?? null }
}

export async function leerResultados(id: number): Promise<ResultadosTanda | null> {
  return resultadosDesdeEventos(await leerEventos(id))
}
