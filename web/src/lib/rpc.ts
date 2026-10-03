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

/** Cuántos TUSD valen hoy `shares` participaciones de la bóveda. */
export async function valorBoveda(shares: bigint): Promise<bigint> {
  const boveda = await direccionBoveda()
  const v = await simular(boveda, 'valor', [nativeToScVal(shares, { type: 'i128' })])
  return BigInt(v as bigint | number | string)
}

// ---------------------------------------------------------------------------
// Eventos del contrato (historia de la tanda y resultados finales)
// ---------------------------------------------------------------------------

// La red solo guarda los eventos un tiempo. Recordamos desde qué ledger empieza esa ventana
// para no preguntarlo en cada lectura; si deja de ser válido, se vuelve a consultar.
let inicioDeEventos: number | null = null
async function ledgerInicial(renovar = false): Promise<number> {
  if (renovar || inicioDeEventos === null) inicioDeEventos = (await servidor().getHealth()).oldestLedger
  return inicioDeEventos
}

/**
 * Todos los eventos de UNA tanda, del más viejo al más nuevo. El contrato publica cada evento con
 * dos "topics": su nombre y el número de la tanda; el comodín "*" acepta cualquier nombre.
 * La red conserva los eventos solo unos días: una tanda muy vieja puede devolver una lista vacía.
 */
export async function leerEventos(id: number): Promise<EventoTanda[]> {
  const cliente = clienteLectura()
  const s = servidor()
  const filtro = {
    type: 'contract' as const,
    contractIds: [TANDA_ID],
    topics: [['*', nativeToScVal(id, { type: 'u32' }).toXDR('base64')]],
  }
  const pedir = (startLedger: number) => s.getEvents({ startLedger, filters: [filtro], limit: 200 })

  let respuesta: Awaited<ReturnType<typeof pedir>>
  try {
    respuesta = await pedir(await ledgerInicial())
  } catch {
    respuesta = await pedir(await ledgerInicial(true))
  }

  const salida: EventoTanda[] = []
  for (const ev of respuesta.events) {
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
