// ¿El contrato desplegado guarda nombres de tanda? (pedido 5 del plan v5). Se mira la interfaz (el spec) del contrato
// que está en la red, no el cliente que trae la web (que ya sabe de nombres): así el campo "Nombre de la tanda"
// aparece en cuanto se despliega el contrato nuevo y se esconde con el anterior (v4).
import { contract } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE, RPC_URL, TANDA_ID } from '../config'

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
