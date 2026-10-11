// ¿El contrato desplegado guarda nombres de tanda? (pedido 5 del plan v5). Se mira la interfaz (el spec) del contrato
// que está en la red, no el cliente que trae la web: así el campo "Nombre de la tanda" aparece en cuanto se despliega
// el contrato nuevo y se esconde con el anterior (v4). Para firmar `crear_tanda_con_nombre` se arma un cliente con ese
// mismo spec, así que funciona aunque el cliente generado todavía no tenga la función.
import { contract } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE, RPC_URL, TANDA_ID } from '../config'
import type { OpcionesTanda } from 'tanda'
import { firmarTransaccion } from './firmante'

export const FN_LEER_NOMBRE = 'get_nombre'
export const FN_CREAR_CON_NOMBRE = 'crear_tanda_con_nombre'
export const FN_CREAR_AVANZADA_CON_NOMBRE = 'crear_tanda_avanzada_con_nombre'

/** Con estas tres funciones el contrato sabe de nombres (las firmas que publicó M1 en el tablero). */
export function soportaNombres(funciones: Iterable<string>): boolean {
  const f = new Set(funciones)
  return f.has(FN_LEER_NOMBRE) && f.has(FN_CREAR_CON_NOMBRE) && f.has(FN_CREAR_AVANZADA_CON_NOMBRE)
}

/** Los nombres de las funciones de un spec. */
export function funcionesDe(spec: Pick<contract.Spec, 'funcs'>): string[] {
  return spec.funcs().map((f) => f.name.toString())
}

// La interfaz desplegada no cambia mientras la página está abierta: se baja una sola vez (si falla, se reintenta).
let espec: Promise<contract.Spec> | null = null
function especDesplegada(): Promise<contract.Spec> {
  espec ??= contract.Client.from({
    contractId: TANDA_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    allowHttp: RPC_URL.startsWith('http://'),
  })
    .then((c) => c.spec)
    .catch((e: unknown) => {
      espec = null
      throw e
    })
  return espec
}

/** ¿Tiene nombres el contrato desplegado? Si no se puede saber, se dice que no (el campo queda escondido). */
export async function contratoTieneNombres(): Promise<boolean> {
  if (!TANDA_ID) return false
  try {
    return soportaNombres(funcionesDe(await especDesplegada()))
  } catch {
    return false
  }
}

/** Lo que recibe `crear_tanda` (y su versión con nombre, más `nombre`). */
export type DatosCrear = {
  creador: string
  token: string
  cuota: bigint
  n_miembros: number
  periodo_seg: bigint
  penalidad_bps: number
  cobertura_bps: number
}

type Armada = contract.AssembledTransaction<unknown>
type ClienteConNombres = {
  crear_tanda_con_nombre(args: DatosCrear & { nombre: string }): Promise<Armada>
  crear_tanda_avanzada_con_nombre(args: DatosCrear & { opciones: OpcionesTanda; nombre: string }): Promise<Armada>
}

/** Un cliente para firmar con el spec del contrato desplegado (igual que `clienteFirma`, incluido `restore`). */
export async function clienteConNombres(direccion: string): Promise<ClienteConNombres> {
  const opciones: contract.ClientOptions & Pick<contract.MethodOptions, 'restore'> = {
    contractId: TANDA_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    allowHttp: RPC_URL.startsWith('http://'),
    publicKey: direccion,
    signTransaction: (xdr, o) => firmarTransaccion(xdr, { ...o, address: direccion }),
    restore: true,
  }
  return new contract.Client(await especDesplegada(), opciones) as unknown as ClienteConNombres
}
